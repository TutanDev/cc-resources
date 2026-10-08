export const meta = {
  name: 'arch-audit',
  description: 'Audit a codebase path with the Löwy, call-chain, DMF and functional-style reviewers, adversarially verify every finding against the code and the project profile, and write one ranked report',
  whenToUse: 'Reviewing the architecture of an existing subsystem or codebase; pass a path, plus --thorough, --lenses=lowy,chains,dmf,fp, --maxSubsystems=N, --date=YYYY-MM-DD or --out=<folder>',
  phases: [
    { title: 'Discover', detail: 'project profile, subsystems under the target' },
    { title: 'Review', detail: 'one reviewer per subsystem and lens' },
    { title: 'Verify', detail: 'skeptics try to refute each finding against the code' },
    { title: 'Report', detail: 'merge, rank and write .claude/docs/reviews/' },
  ],
}

// ---------- input ----------
// A slash command passes one string: "<target> [--flag] [--name=value]". A JSON object or a structured call passes the object.
function parseInput(raw, key, options) {
  if (raw && typeof raw === 'object') return raw
  const text = String(raw || '').trim()
  if (text.startsWith('{')) return JSON.parse(text)
  const parsed = {}
  const words = []
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const flag = token.match(/^--([A-Za-z]+)(?:=(.*))?$/)
    if (!flag) { words.push(token); continue }
    const [, name, value] = flag
    if (!(name in options)) throw new Error(`Unknown option --${name}. Options: ${Object.keys(options).map(o => '--' + o).join(', ')}.`)
    parsed[name] = options[name](value)
  }
  parsed[key] = words.join(' ')
  return parsed
}
const input = parseInput(args, 'target', {
  thorough: () => true,
  lenses: v => String(v || '').split(',').filter(Boolean),
  maxSubsystems: v => Number(v),
  date: v => v,
  out: v => v,
})
const target = (input.target || '.').trim()
const LENSES = {
  lowy: { agentType: 'lowy-dmf:lowy-reviewer', name: 'Löwy structure' },
  chains: { agentType: 'lowy-dmf:call-chain-validator', name: 'call chains' },
  dmf: { agentType: 'lowy-dmf:dmf-reviewer', name: 'DMF domain modeling' },
  fp: { agentType: 'lowy-dmf:fp-reviewer', name: 'functional style' },
}
const lenses = input.lenses && input.lenses.length ? input.lenses : Object.keys(LENSES)
const unknownLenses = lenses.filter(l => !LENSES[l])
if (unknownLenses.length) throw new Error(`Unknown lens ${unknownLenses.join(', ')}. Lenses: ${Object.keys(LENSES).join(', ')}.`)
const votes = input.thorough ? 3 : 1
const maxSubsystems = input.maxSubsystems || 6
const GROUP_SIZE = 6

// ---------- schemas ----------
const STRINGS = { type: 'array', items: { type: 'string' } }
const FINDING = {
  type: 'object',
  required: ['id', 'lens', 'rule', 'status', 'severity', 'file', 'lines', 'evidence', 'problem', 'fix', 'profileRef', 'occurrences'],
  properties: {
    id: { type: 'string' },
    lens: { type: 'string', enum: ['lowy', 'chains', 'dmf', 'fp'] },
    rule: { type: 'string' },
    status: { type: 'string', enum: ['violation', 'debt', 'approved'] },
    severity: { type: 'string', enum: ['critical', 'major', 'minor', 'nit'] },
    file: { type: 'string' },
    lines: { type: 'string' },
    evidence: { type: 'string' },
    problem: { type: 'string' },
    fix: { type: 'string' },
    profileRef: { type: 'string' },
    occurrences: STRINGS,
  },
}
const DISCOVERY = {
  type: 'object',
  required: ['repoRoot', 'targetName', 'profilePath', 'today', 'revision', 'subsystems', 'skipped'],
  properties: {
    repoRoot: { type: 'string' },
    targetName: { type: 'string', description: 'kebab-case name of the target, for the report file name' },
    profilePath: { type: 'string', description: 'path of .claude/docs/architecture.md, or empty if none' },
    today: { type: 'string', description: 'YYYY-MM-DD' },
    revision: { type: 'string', description: 'git short SHA and branch, or empty' },
    subsystems: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'path', 'why'],
        properties: { name: { type: 'string' }, path: { type: 'string' }, why: { type: 'string' } },
      },
    },
    skipped: STRINGS,
  },
}
const REVIEW = {
  type: 'object',
  required: ['findings', 'summary', 'aligned', 'profileGaps', 'notChecked'],
  properties: {
    findings: { type: 'array', items: FINDING },
    summary: { type: 'string', description: 'Markdown: inventory and scorecard (lowy), chain verdicts and coverage (chains), guideline counts (fp), or a short overview (dmf)' },
    aligned: STRINGS,
    profileGaps: STRINGS,
    notChecked: STRINGS,
  },
}
const VERDICTS = {
  type: 'object',
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'verdict', 'status', 'severity', 'reason'],
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'adjusted', 'refuted'] },
          status: { type: 'string', enum: ['violation', 'debt', 'approved'] },
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'nit'] },
          reason: { type: 'string' },
        },
      },
    },
  },
}
const REPORT = {
  type: 'object',
  required: ['path', 'summary'],
  properties: {
    path: { type: 'string' },
    summary: { type: 'string', description: 'Markdown, at most 25 lines: counts and the top actions' },
  },
}

// ---------- helpers ----------
function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function groupByFile(findings) {
  const byFile = {}
  for (const f of findings) (byFile[f.file] = byFile[f.file] || []).push(f)
  return Object.values(byFile).flatMap(g => chunk(g, GROUP_SIZE))
}

// Majority vote per finding; a finding no verifier answered for stays, marked unverified.
function tally(group, ballots) {
  return group.map(f => {
    const answers = ballots.filter(Boolean).flatMap(b => b.verdicts).filter(v => v.id === f.id)
    if (answers.length === 0) return { ...f, verification: 'unverified', reason: 'no verifier answered' }
    const upheld = answers.filter(v => v.verdict !== 'refuted')
    if (upheld.length * 2 <= answers.length) {
      return { ...f, verification: 'refuted', reason: answers.map(v => v.reason).join(' | ') }
    }
    const v = upheld[0]
    return { ...f, status: v.status, severity: v.severity, verification: v.verdict, reason: v.reason }
  })
}

// A subsystem folder can hold another subsystem (a nested asmdef); each file belongs to one review only.
const folder = p => String(p).replace(/\\/g, '/').replace(/\/+$/, '')
const nestedIn = s => disc.subsystems.filter(o => o !== s && folder(o.path).startsWith(`${folder(s.path)}/`))
const scopeNote = s => {
  const nested = nestedIn(s)
  const leaveOut = nested.length === 0 ? '' :
    ` Leave out ${nested.map(o => `\`${o.path}\``).join(', ')}: ${nested.length === 1 ? 'it is a separate subsystem' : 'they are separate subsystems'}, except where this subsystem calls into ${nested.length === 1 ? 'it' : 'them'}.`
  return `Review only the subsystem at \`${s.path}\` (${s.name}).${leaveOut} A finding may cite a file outside it only when the problem is at this subsystem's boundary: a caller, a consumer of its messages, or a type it exposes. Repository root: \`${disc.repoRoot}\`.`
}
const profileNote = () => disc.profilePath
  ? `The project profile is \`${disc.profilePath}\`: apply its precedence to every finding's status.`
  : 'There is no project profile: every finding is a violation; say so once in the summary.'

// ---------- Discover ----------
phase('Discover')
const disc = await agent(
  `Prepare an architecture audit of \`${target}\` (a path relative to the current directory, or absolute).
Read only; do not modify anything.

1. repoRoot: the repository root (\`git rev-parse --show-toplevel\`, or the current directory).
2. profilePath: \`.claude/docs/architecture.md\` under the repository root if it exists, else empty.
3. today: ${input.date ? `use ${input.date}` : 'today\'s date as YYYY-MM-DD (run `date +%F`, or `Get-Date -Format yyyy-MM-dd` in PowerShell)'}.
4. revision: \`git rev-parse --short HEAD\` and the branch name, or empty.
5. subsystems: the independent subsystems under the target.
   If the profile maps subsystems to folders, use that mapping.
   Otherwise a subsystem is a folder that owns its own Managers (types named *Manager, or the profile's equivalent), usually with its own asmdef or package.
   If the target is itself one subsystem, or holds fewer than two, return the target as the only subsystem.
   Give each a short name and say why you picked it (\`why\`).
   Skip generated, third-party and test folders (Library, PackageCache, Plugins from vendors, Samples, Tests) and list what you skipped in \`skipped\`.
6. targetName: a kebab-case name for the target (the subsystem or folder name).`,
  { schema: DISCOVERY, label: 'discover' },
)
if (!disc || disc.subsystems.length === 0) {
  return 'arch-audit: no subsystem found under the target; nothing to review.'
}
const today = input.date || disc.today
let subsystems = disc.subsystems
if (subsystems.length > maxSubsystems) {
  log(`Found ${subsystems.length} subsystems; auditing the first ${maxSubsystems}. Not audited: ${subsystems.slice(maxSubsystems).map(s => s.name).join(', ')}. Pass maxSubsystems to include them.`)
  subsystems = subsystems.slice(0, maxSubsystems)
}
log(`Auditing ${subsystems.map(s => s.name).join(', ')} with lenses ${lenses.join(', ')}; ${votes}-vote verification. Profile: ${disc.profilePath || 'none'}.`)

// ---------- Review + Verify (no barrier between them) ----------
const work = subsystems.flatMap(s => lenses.map(lens => ({ s, lens })))

const results = await pipeline(
  work,
  ({ s, lens }) => agent(
    `${scopeNote(s)}
${profileNote()}
Review it through your lens (${LENSES[lens].name}) and return every finding, with \`lens: "${lens}"\` and ids unique within this review.
${lens === 'chains' ? 'Code mode: derive the core use cases from the Managers\' public operations, say they are derived, and validate each chain from its entry point.' : ''}
Quote real code for every finding; findings without evidence will be discarded.`,
    { agentType: LENSES[lens].agentType, schema: REVIEW, phase: 'Review', label: `${lens}: ${s.name}` },
  ),
  async (review, { s, lens }) => {
    if (!review) return { s, lens, review: null, findings: [] }
    const groups = groupByFile(review.findings)
    const checked = await parallel(groups.map((group, gi) => async () => {
      const ballots = await parallel(Array.from({ length: votes }, (_, vi) => () => agent(
        `You are verifying findings from another reviewer, not reviewing.
Try to refute each finding below.
${scopeNote(s)}
${profileNote()}
For each finding:
- Open \`file\` at \`lines\` and check that the evidence is really there and says what the finding claims.
- Check that the rule applies: re-read the rule in your references, including relaxed rules and guardrails (for example, Engines may call ResourceAccess; Unity lifecycle methods and per-frame code are boundaries for functional style; Löwy contracts stay interfaces).
- Check the status against the profile: \`debt\` and \`approved\` need a matching entry; consistent use in the codebase is not approval.
- Check the severity against its real impact.
- A file outside the subsystem is not by itself a reason to refute: refute only when the problem has nothing to do with this subsystem's boundary.
Answer \`refuted\` when the evidence is missing or wrong, or the rule does not apply; \`adjusted\` when the finding is real but its status or severity is wrong (give the corrected values); \`confirmed\` otherwise.
When in doubt after reading the code, answer refuted.
${vi > 0 ? `You are independent verifier #${vi + 1}; reach your own conclusion.` : ''}
Findings (JSON):
${JSON.stringify(group, null, 1)}`,
        { agentType: LENSES[lens].agentType, schema: VERDICTS, phase: 'Verify', label: `verify ${lens}: ${s.name} #${gi + 1}${votes > 1 ? `.${vi + 1}` : ''}` },
      )))
      return tally(group, ballots)
    }))
    // A group whose verification crashed keeps its findings, marked unverified.
    const findings = checked.flatMap((c, i) => c || groups[i].map(f => ({ ...f, verification: 'unverified', reason: 'verifier failed' })))
    return { s, lens, review, findings }
  },
)

// ---------- Report (barrier: needs every lens to merge) ----------
const done = results.filter(Boolean)
const failed = done.filter(r => !r.review).map(r => `${r.lens}: ${r.s.name}`)
if (failed.length) log(`Reviews that failed and are missing from the report: ${failed.join(', ')}`)
const all = done.flatMap(r => r.findings.map(f => ({ ...f, id: `${r.s.name}/${f.id}`, subsystem: r.s.name })))
const kept = all.filter(f => f.verification !== 'refuted')
const refuted = all.filter(f => f.verification === 'refuted')
log(`${all.length} findings: ${kept.length} kept (${kept.filter(f => f.verification === 'unverified').length} unverified), ${refuted.length} refuted.`)

phase('Report')
// Reports go to .claude/docs/reviews/ unless --out names another folder, absolute or relative to the repository root.
const reportDir = String(input.out || '.claude/docs/reviews').replace(/[\\/]+$/, '')
const resolvePath = file => (/^([A-Za-z]:)?[\\/]/.test(reportDir) ? file : `${disc.repoRoot}/${file}`)
const reportPath = resolvePath(`${reportDir}/${disc.targetName}-arch-audit-${today}.md`)
const report = await agent(
  `Write the architecture audit report to \`${reportPath}\` (create the folder if needed), then return its path and a short summary.
Do not modify any other file.

Context: target \`${target}\`, revision ${disc.revision || 'unknown'}, date ${today}, profile ${disc.profilePath || 'none'}, lenses ${lenses.join(', ')}, ${votes}-vote adversarial verification.
Skipped folders: ${disc.skipped.join(', ') || 'none'}.
${failed.length ? `Reviews that failed (say so in the report): ${failed.join(', ')}.` : ''}

Merge first: two findings are one when they point at the same code (same file, overlapping lines) for the same root cause.
Keep the clearest problem and fix, list every rule and lens it breaks, and merge their occurrences.
Rank by status (violation, then debt, then approved), then severity, then how many places it occurs.

Report structure:
1. Title \`# Architecture Audit: ${disc.targetName}\`, then a \`> Source:\` line with the target, revision, profile and date.
2. Summary: a table of violation counts per lens and severity, plus the debt, approved, unverified and refuted counts.
3. Top actions: at most 7, each naming the findings it resolves.
4. Per-subsystem scorecard, from the reviewers' summaries.
5. Violations (❌), most severe first: severity mark (🔴 critical, 🟠 major, 🟡 minor, ⚪ nit), id, rules, \`file:lines\`, quoted evidence, problem, fix, occurrences, and "unverified" where it applies.
6. Known debt (⚠️) and approved deviations (✅), as tables citing the profile entry.
7. Profile gaps: deduplicated proposals for the user to decide; never present them as approved.
8. Not checked, and what is aligned (short).
9. Refuted during verification: one line each (id, rule, file:line, reason).

Reviewer summaries (JSON):
${JSON.stringify(done.filter(r => r.review).map(r => ({ subsystem: r.s.name, lens: r.lens, summary: r.review.summary, aligned: r.review.aligned, profileGaps: r.review.profileGaps, notChecked: r.review.notChecked })), null, 1)}

Findings kept (JSON):
${JSON.stringify(kept, null, 1)}

Findings refuted (JSON):
${JSON.stringify(refuted.map(f => ({ id: f.id, rule: f.rule, file: f.file, lines: f.lines, reason: f.reason })), null, 1)}`,
  { schema: REPORT, label: 'report' },
)

return report
  ? `${report.summary}\n\nReport: ${report.path}`
  : `arch-audit: the report agent failed. ${kept.length} findings were kept and ${refuted.length} refuted; relaunch to retry the report from cached results.`
