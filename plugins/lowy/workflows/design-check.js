export const meta = {
  name: 'design-check',
  description: "Check a Löwy/DMF design directory before implementing it: staleness, one call-chain validator per core use case, structure and Design Don'ts, one change simulation per axis of volatility, a DMF review of 04 if present, adversarial verification, and one report",
  whenToUse: 'After 03-layered-architecture.md exists and before implementation; pass the design topic or directory, plus --thorough, --date=YYYY-MM-DD or --out=<folder>',
  phases: [
    { title: 'Load', detail: 'design files, staleness, use cases, volatilities' },
    { title: 'Check', detail: 'call chains, structure, change simulation, domain model' },
    { title: 'Verify', detail: 'skeptics try to refute critical and major findings' },
    { title: 'Report', detail: 'write .claude/docs/reviews/' },
  ],
}

// Keep this file LF-only: the Workflow tool rejects scripts that contain carriage returns.
// The repository .gitattributes checks it out with LF on every platform.

// ---------- input ----------
// A slash command passes one string: "<topic> [--flag] [--name=value]". A JSON object or a structured call passes the object.
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
const input = parseInput(args, 'topic', {
  thorough: () => true,
  date: v => v,
  out: v => v,
})
const topic = (input.topic || '').trim()
const votes = input.thorough ? 3 : 1

// Authoritative inputs per file, from references/artifact-pipeline.md (Consumes lines).
const INPUTS = {
  '02-volatilities.md': ['01-domain-discovery.md'],
  '03-layered-architecture.md': ['01-domain-discovery.md', '02-volatilities.md'],
  '04-domain-model.md': ['01-domain-discovery.md', '03-layered-architecture.md'],
  '05-call-chains.md': ['01-domain-discovery.md', '02-volatilities.md', '03-layered-architecture.md'],
  '06-workflow-pipelines.md': ['01-domain-discovery.md', '04-domain-model.md', '05-call-chains.md'],
  '07-service-wiring.md': ['03-layered-architecture.md', '04-domain-model.md', '05-call-chains.md'],
  '08-serialization-bridge.md': ['01-domain-discovery.md', '04-domain-model.md', '06-workflow-pipelines.md', '07-service-wiring.md'],
}

// ---------- schemas ----------
const STRINGS = { type: 'array', items: { type: 'string' } }
const FINDING = {
  type: 'object',
  required: ['id', 'lens', 'rule', 'status', 'severity', 'file', 'lines', 'evidence', 'problem', 'fix', 'profileRef', 'occurrences'],
  properties: {
    id: { type: 'string' },
    lens: { type: 'string', enum: ['lowy', 'chains', 'dmf', 'change'] },
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
const LOAD = {
  type: 'object',
  required: ['repoRoot', 'designDir', 'topic', 'today', 'profilePath', 'files', 'stale', 'useCases', 'volatilities', 'note'],
  properties: {
    repoRoot: { type: 'string' },
    designDir: { type: 'string', description: 'empty if no design directory with 03-layered-architecture.md was found' },
    topic: { type: 'string' },
    today: { type: 'string' },
    profilePath: { type: 'string' },
    files: STRINGS,
    stale: {
      type: 'array',
      items: { type: 'object', required: ['file', 'newerInputs'], properties: { file: { type: 'string' }, newerInputs: STRINGS } },
    },
    useCases: {
      type: 'array',
      items: { type: 'object', required: ['name', 'description', 'source'], properties: { name: { type: 'string' }, description: { type: 'string' }, source: { type: 'string' } } },
    },
    volatilities: {
      type: 'array',
      items: { type: 'object', required: ['axis', 'encapsulatedBy', 'source'], properties: { axis: { type: 'string' }, encapsulatedBy: { type: 'string' }, source: { type: 'string' } } },
    },
    note: { type: 'string' },
  },
}
const CHECK = {
  type: 'object',
  required: ['findings', 'summary'],
  properties: { findings: { type: 'array', items: FINDING }, summary: { type: 'string' } },
}
const VERDICT = {
  type: 'object',
  required: ['verdict', 'status', 'severity', 'reason'],
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'adjusted', 'refuted'] },
    status: { type: 'string', enum: ['violation', 'debt', 'approved'] },
    severity: { type: 'string', enum: ['critical', 'major', 'minor', 'nit'] },
    reason: { type: 'string' },
  },
}
const REPORT = {
  type: 'object',
  required: ['path', 'summary'],
  properties: { path: { type: 'string' }, summary: { type: 'string', description: 'Markdown, at most 25 lines' } },
}

// ---------- Load ----------
phase('Load')
const d = await agent(
  `Prepare a design check. Read only; do not modify anything.

1. repoRoot: the repository root (\`git rev-parse --show-toplevel\`, or the current directory).
2. designDir: ${topic
    ? `the design directory for "${topic}": the path itself if it is a directory, else \`.claude/docs/design/${topic}/\`, else the closest match under \`.claude/docs/design/\`.`
    : 'the only directory under `.claude/docs/design/`, or the most recently modified one; say which and why in `note`.'}
   It must contain \`03-layered-architecture.md\`; if none does, return designDir empty and explain in \`note\`.
3. topic: the directory name. today: ${input.date ? input.date : 'today as YYYY-MM-DD (`date +%F`, or `Get-Date -Format yyyy-MM-dd`)'}.
4. profilePath: \`.claude/docs/architecture.md\` under the repository root if it exists, else empty.
5. files: the numbered design files present.
6. stale: compare modification times (\`ls -l --time-style=full-iso\` or \`Get-Item\`); a file is stale when any of its inputs is newer.
   Inputs per file: ${JSON.stringify(INPUTS)}.
7. useCases: the core use cases from \`02-volatilities.md\` §2 (or, if missing, from \`05-call-chains.md\` §1 or \`01-domain-discovery.md\` workflows); cite the source section.
8. volatilities: the axes of volatility from \`02-volatilities.md\` §3, each with the service that encapsulates it per \`03-layered-architecture.md\` §2 (empty string if none does); cite the source.`,
  { schema: LOAD, label: 'load' },
)
if (!d || !d.designDir) {
  return `design-check: ${d ? d.note : 'the load agent failed'}. Run the design phases up to 03-layered-architecture.md first.`
}
const today = input.date || d.today
const has04 = d.files.includes('04-domain-model.md')
const profileNote = d.profilePath
  ? `Apply the project profile \`${d.profilePath}\` to every finding's status.`
  : 'There is no project profile: every finding is a violation.'
const dir = d.designDir
log(`Checking ${dir}: ${d.useCases.length} core use cases, ${d.volatilities.length} axes of volatility${has04 ? ', domain model present' : ''}. ${d.stale.length ? `Stale: ${d.stale.map(s => s.file).join(', ')}.` : 'Nothing stale.'}`)

// ---------- Check ----------
const checks = [
  ...d.useCases.map((uc, i) => ({
    key: `chain ${i + 1}: ${uc.name}`,
    agentType: 'lowy:call-chain-validator',
    prompt: `Design mode. Validate one core use case against the design in \`${dir}\` (read \`03-layered-architecture.md\`, and \`01\`/\`02\` for context).
Use case: "${uc.name}" - ${uc.description} (source: ${uc.source}).
${profileNote}
Return findings with \`lens: "chains"\`, ids \`C-${i + 1}.n\`, and \`file\` set to the design file you cite. Put the chain and its verdict in \`summary\`.`,
  })),
  {
    key: 'structure',
    agentType: 'lowy:lowy-reviewer',
    prompt: `Review the design \`${dir}/03-layered-architecture.md\` as written (design mode, no code inventory): layers, naming, the 12 Design Don'ts, closed architecture and relaxations, ratios, symmetry, expendability, decomposition smells.
Cross-check it against \`02-volatilities.md\`: every candidate service is placed, and no service exists without a reason.
${profileNote}
Return findings with \`lens: "lowy"\` and ids \`L-n\`. Put the scorecard in \`summary\`.`,
  },
  ...d.volatilities.map((v, i) => ({
    key: `change ${i + 1}: ${v.axis}`,
    agentType: 'lowy:lowy-reviewer',
    prompt: `Change simulation (design mode) on \`${dir}\`.
Imagine the change "${v.axis}" happens (source: ${v.source}); the design says ${v.encapsulatedBy ? `\`${v.encapsulatedBy}\` encapsulates it` : 'no service encapsulates it'}.
Using \`03-layered-architecture.md\` (and \`05-call-chains.md\`/\`07-service-wiring.md\` if present), list every service whose code or contract would have to change.
Volatility-based decomposition passes when the change stays inside the encapsulating service (its Manager may need a small integration change).
It fails when the change ripples into several services, into contracts between them, or into Clients, or when no service owns the axis.
Return one finding per failure with \`lens: "change"\`, ids \`X-${i + 1}.n\`, and rule "Volatility not encapsulated"; return no findings when it passes.
Put the list of services that change, and the verdict, in \`summary\`.`,
  })),
  ...(has04 ? [{
    key: 'domain model',
    agentType: 'dmf:dmf-reviewer',
    prompt: `Design review of \`${dir}/04-domain-model.md\` against DMF, in C# terms: illegal states, primitive obsession, smart constructors, lifecycle stages, unions and totality, workflow signatures and effects, error unions, DTO boundaries.
Check that its services match \`03-layered-architecture.md\` §8 and its types use the language of \`01-domain-discovery.md\` (if present).
${profileNote}
Return findings with \`lens: "dmf"\` and ids \`D-n\`.`,
  }] : []),
]

phase('Check')
const results = await pipeline(
  checks,
  c => agent(c.prompt, { agentType: c.agentType, schema: CHECK, phase: 'Check', label: c.key }),
  async (res, c) => {
    if (!res) return { key: c.key, res: null, findings: [] }
    // Only critical and major violations are worth a skeptic; the rest are reported as found.
    const findings = await parallel(res.findings.map(f => async () => {
      if (f.status !== 'violation' || (f.severity !== 'critical' && f.severity !== 'major')) {
        return { ...f, verification: 'not verified (minor)' }
      }
      const ballots = (await parallel(Array.from({ length: votes }, (_, vi) => () => agent(
        `You are verifying a finding from another reviewer, not reviewing. Try to refute it.
Design directory: \`${dir}\`. ${profileNote}
Re-read the cited design text, then the rule in your references (including the relaxed rules).
Refute it if the evidence is not in the design, the rule does not apply, or the design handles it elsewhere (another section, another file).
Answer adjusted with corrected status or severity if it is real but mis-rated. When in doubt, refute.
${vi > 0 ? `You are independent verifier #${vi + 1}.` : ''}
Finding (JSON): ${JSON.stringify(f)}`,
        { agentType: c.agentType, schema: VERDICT, phase: 'Verify', label: `verify ${f.id}${votes > 1 ? `.${vi + 1}` : ''}` },
      )))).filter(Boolean)
      if (ballots.length === 0) return { ...f, verification: 'unverified' }
      const upheld = ballots.filter(b => b.verdict !== 'refuted')
      if (upheld.length * 2 <= ballots.length) return { ...f, verification: 'refuted', reason: ballots.map(b => b.reason).join(' | ') }
      return { ...f, status: upheld[0].status, severity: upheld[0].severity, verification: upheld[0].verdict, reason: upheld[0].reason }
    }))
    return { key: c.key, res, findings: findings.map((f, i) => f || { ...res.findings[i], verification: 'unverified' }) }
  },
)

// ---------- Report ----------
const done = results.filter(Boolean)
const failed = done.filter(r => !r.res).map(r => r.key)
if (failed.length) log(`Checks that failed and are missing from the report: ${failed.join(', ')}`)
const all = done.flatMap(r => r.findings)
const kept = all.filter(f => f.verification !== 'refuted')
const refuted = all.filter(f => f.verification === 'refuted')
log(`${all.length} findings: ${kept.length} kept, ${refuted.length} refuted.`)

phase('Report')
// Reports go to .claude/docs/reviews/ unless --out names another folder, absolute or relative to the repository root.
const reportDir = String(input.out || '.claude/docs/reviews').replace(/[\\/]+$/, '')
const resolvePath = file => (/^([A-Za-z]:)?[\\/]/.test(reportDir) ? file : `${d.repoRoot}/${file}`)
const reportPath = resolvePath(`${reportDir}/${d.topic}-design-check-${today}.md`)
const report = await agent(
  `Write the design check report to \`${reportPath}\` (create the folder if needed), then return its path and a short summary.
Do not modify any other file.

Context: design \`${dir}\`, date ${today}, profile ${d.profilePath || 'none'}, ${votes}-vote verification of critical and major violations.
Stale files: ${JSON.stringify(d.stale)}. ${d.note}
${failed.length ? `Checks that failed (say so): ${failed.join(', ')}.` : ''}

Merge duplicates (same design element, same root cause), then rank by status, severity and spread.
Report structure:
1. Title \`# Design Check: ${d.topic}\`, then a \`> Source:\` line listing the design files and the date.
2. Verdict: ready to implement, or not, in one sentence, then counts by lens and severity.
3. Stale files first, if any: what to regenerate, in pipeline order.
4. Call chains: one line per core use case with its verdict.
5. Change simulation: one line per axis with the services that change and the verdict.
6. Findings (❌, then ⚠️ and ✅), most severe first: severity mark (🔴 critical, 🟠 major, 🟡 minor, ⚪ nit), id, rule, file and section, quoted evidence, problem, fix.
7. Refuted during verification: one line each.

Check summaries (JSON):
${JSON.stringify(done.filter(r => r.res).map(r => ({ check: r.key, summary: r.res.summary })), null, 1)}

Findings kept (JSON):
${JSON.stringify(kept, null, 1)}

Findings refuted (JSON):
${JSON.stringify(refuted.map(f => ({ id: f.id, rule: f.rule, file: f.file, reason: f.reason })), null, 1)}`,
  { schema: REPORT, label: 'report' },
)

return report
  ? `${report.summary}\n\nReport: ${report.path}`
  : `design-check: the report agent failed. ${kept.length} findings kept, ${refuted.length} refuted; relaunch to retry from cached results.`
