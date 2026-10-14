export const meta = {
  name: 'review-plan',
  description: 'Review and revise a feature plan, round by round: blind Löwy, call-chain, DMF and delivery reviewers, adversarial verification of their findings, a judge that accepts, rejects or asks the user about each, the plan writer applying the rulings, and a report per round',
  whenToUse: 'After a feature plan exists in cc-docs/plans/ and before the user approves it; pass the feature name or plan path, plus --thorough, --lenses=lowy,chains,dmf,plan, --rounds=N or --date=YYYY-MM-DD. The devflow:plan-feature skill runs it, then takes the user\'s answers and approval',
  phases: [
    { title: 'Load', detail: 'plan, status, profile, design sources, use cases, last round, access' },
    { title: 'Review', detail: 'one blind reviewer per lens; a re-review round runs the lenses its changes touched' },
    { title: 'Verify', detail: 'a skeptic per lens tries to refute its critical and major findings' },
    { title: 'Judge', detail: 'accept, reject or ask the user, per finding' },
    { title: 'Revise', detail: 'the plan writer applies the rulings, and the round report is written' },
  ],
}

// Keep this file LF-only: the Workflow tool rejects scripts that contain carriage returns.
// The repository .gitattributes checks it out with LF on every platform.

// The agents write the plan and the reports themselves, under cc-docs/: Claude Code refuses every write under .claude/
// from a background agent, and workflow agents run in the background. They cannot ask for approval, so outside the
// session's folder a read needs a permission too, and so do the reviewers' reads of their plugins' reference files.
// One small read and one small write run before any reviewer, and a refused one stops the run before their work is spent.
// The caller sees only the first few kilobytes of a workflow's result, so the result stays short: the details are in
// the reports and the plan.

// Every agent pays for its own context: its instructions, the plan, its reference files and the code it reads. So the
// run keeps agents few, and runs each on the model and effort its work needs (ROLES below). --thorough spends more for
// confidence: the review stages on the session's model and effort, a call-chain reviewer per use case, three skeptics
// per lens, and every lens in a re-review round.

// ---------- input ----------
// A slash command passes one string: "<plan> [--flag] [--name=value]". A JSON object or a structured call passes the object.
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
const input = parseInput(args, 'plan', {
  thorough: () => true,
  lenses: v => v,
  rounds: v => v,
  date: v => v,
})
const target = String(input.plan || '').trim()
const LENSES = {
  lowy: { agentType: 'lowy:lowy-reviewer', name: 'Löwy structure' },
  chains: { agentType: 'lowy:call-chain-validator', name: 'call chains' },
  dmf: { agentType: 'dmf:dmf-reviewer', name: 'DMF domain modeling' },
  plan: { agentType: 'devflow:plan-reviewer', name: 'delivery' },
}
const requestedLenses = Array.isArray(input.lenses) ? input.lenses : String(input.lenses || '').split(',').filter(Boolean)
const lenses = requestedLenses.length ? requestedLenses : Object.keys(LENSES)
const unknownLenses = lenses.filter(l => !LENSES[l])
if (unknownLenses.length) throw new Error(`Unknown lens ${unknownLenses.join(', ')}. Lenses: ${Object.keys(LENSES).join(', ')}.`)
const thorough = Boolean(input.thorough)
// The skeptics per lens: a finding stands when at least half of those who answered uphold it.
const votes = thorough ? 3 : 1
// The rounds this run may take: each round after the first reviews the critical and major changes of the one before.
const maxRounds = Math.max(1, Math.floor(Number(input.rounds)) || 2)
// What changed since the plan's last review round, such as the user's answers; only a structured call can pass it.
const focusInput = String(input.focus || '').trim()
// A review never rewrites a plan that is being built or is built: it only reports.
const REVISABLE = ['draft', 'reviewed', 'approved']

// ---------- models ----------
// The model and effort of each role; what a role leaves out comes from the session. Haiku does the mechanical work,
// Sonnet reviews and verifies, and the judge and the writer, whose judgment becomes the plan, run on the session's model.
const ROLES = {
  mechanical: { model: 'haiku', effort: 'low' },
  review: thorough ? {} : { model: 'sonnet', effort: 'high' },
  verify: thorough ? {} : { model: 'sonnet', effort: 'medium' },
  judge: thorough ? {} : { effort: 'high' },
  revise: { effort: 'medium' },
}

// A re-review round runs the lenses that own the sections its changes touched: the call chains own §3 and §4, Löwy §4,
// DMF §3 and §5, and the delivery lens every section, since each change must still land in a phase and be tested.
// Without a section to go by, every lens runs.
const SECTION_LENSES = { 3: ['chains', 'dmf'], 4: ['lowy', 'chains'], 5: ['dmf'] }
function lensesFor(sections) {
  const numbers = sections.flatMap(s => [
    ...[...String(s).matchAll(/§\s*(\d)/g)].map(m => Number(m[1])),
    ...(/\bphase\b/i.test(String(s)) ? [6] : []),
  ])
  if (thorough || numbers.length === 0) return lenses
  const wanted = new Set(['plan', ...numbers.flatMap(n => SECTION_LENSES[n] || [])])
  const chosen = lenses.filter(l => wanted.has(l))
  return chosen.length ? chosen : lenses
}

// ---------- schemas ----------
const STRINGS = { type: 'array', items: { type: 'string' } }
const SEVERITY = { type: 'string', enum: ['critical', 'major', 'minor', 'nit'] }
const STATUS = { type: 'string', enum: ['violation', 'debt', 'approved'] }
const FINDING = {
  type: 'object',
  required: ['id', 'lens', 'rule', 'status', 'severity', 'file', 'lines', 'evidence', 'problem', 'fix', 'profileRef', 'occurrences'],
  properties: {
    id: { type: 'string' },
    lens: { type: 'string', enum: ['lowy', 'chains', 'dmf', 'plan'] },
    rule: { type: 'string' },
    status: STATUS,
    severity: SEVERITY,
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
  required: ['repoRoot', 'planPath', 'feature', 'today', 'status', 'revision', 'profilePath', 'sources', 'designDir', 'stale', 'useCases', 'missing', 'openQuestions', 'lastRound', 'legacyDocs', 'note'],
  properties: {
    repoRoot: { type: 'string' },
    planPath: { type: 'string', description: 'repository-relative path of the plan; empty if no plan was found' },
    feature: { type: 'string' },
    today: { type: 'string' },
    status: { type: 'string', enum: ['draft', 'reviewed', 'approved', 'in-progress', 'done', 'unknown'] },
    revision: { type: 'string' },
    profilePath: { type: 'string' },
    sources: STRINGS,
    designDir: { type: 'string' },
    stale: STRINGS,
    useCases: {
      type: 'array',
      items: { type: 'object', required: ['id', 'name', 'summary'], properties: { id: { type: 'string' }, name: { type: 'string' }, summary: { type: 'string' } } },
    },
    missing: STRINGS,
    openQuestions: STRINGS,
    lastRound: { type: 'integer', description: 'the highest n among the "Round <n>" headings in §9; 0 if there are none' },
    legacyDocs: { type: 'boolean', description: 'whether .claude/docs/ holds architecture.md, design/, plans/ or reviews/' },
    note: { type: 'string' },
  },
}
const CHECK = {
  type: 'object',
  required: ['findings', 'summary'],
  properties: { findings: { type: 'array', items: FINDING }, summary: { type: 'string' } },
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
          id: { type: 'string', description: 'the id of the finding, as given' },
          verdict: { type: 'string', enum: ['confirmed', 'adjusted', 'refuted'] },
          status: STATUS,
          severity: SEVERITY,
          reason: { type: 'string' },
        },
      },
    },
  },
}
const RULINGS = {
  type: 'object',
  required: ['rulings', 'conflicts', 'notes', 'summary'],
  properties: {
    rulings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['findings', 'ruling', 'severity', 'reason', 'sections', 'change', 'question'],
        properties: {
          findings: { ...STRINGS, description: 'ids of the findings this ruling covers' },
          ruling: { type: 'string', enum: ['accept', 'reject', 'ask'] },
          severity: SEVERITY,
          reason: { type: 'string' },
          sections: { ...STRINGS, description: 'plan sections to change, for accept; empty otherwise' },
          change: { type: 'string', description: 'the exact edit, for accept; empty otherwise' },
          question: { type: 'string', description: 'the question with options and a recommendation, for ask; empty otherwise' },
        },
      },
    },
    conflicts: STRINGS,
    notes: { type: 'string' },
    summary: { type: 'string' },
  },
}
const READABLE = {
  type: 'object',
  required: ['read', 'path', 'error'],
  properties: {
    read: { type: 'boolean', description: 'whether the Read succeeded' },
    path: { type: 'string', description: 'the file you read, as you passed it to Read' },
    error: { type: 'string', description: 'why the Read was refused, word for word; empty when read' },
  },
}
const WRITTEN = {
  type: 'object',
  required: ['written', 'error'],
  properties: {
    written: { type: 'boolean', description: 'whether the Write succeeded' },
    error: { type: 'string', description: 'why the Write was refused, word for word; empty when written' },
  },
}
const REVISION = {
  type: 'object',
  required: ['written', 'status', 'revision', 'changes', 'questions', 'note'],
  properties: {
    written: { type: 'boolean', description: 'whether every change to the plan file was saved' },
    status: { type: 'string', description: 'the status the plan was left at' },
    revision: { type: 'string', description: 'the revision number the plan was left at' },
    changes: { type: 'string', description: 'one line per accepted ruling: <finding ids>: <what changed> (<sections>)' },
    questions: { ...STRINGS, description: 'the Q-n ids added to §8' },
    note: { type: 'string', description: 'why the plan was not saved, word for word; else anything the caller must know, or empty' },
  },
}

// ---------- helpers ----------
const SEVERITIES = ['critical', 'major', 'minor', 'nit']
const MARKS = { critical: '🔴', major: '🟠', minor: '🟡', nit: '⚪' }
const isSerious = f => f.severity === 'critical' || f.severity === 'major'
const bySeverity = (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)
// Shortens text for the result at a word boundary, without a final period: the result's own sentence ends it.
const clip = (text, max) => {
  const t = String(text || '').trim().replace(/\.+$/, '')
  if (t.length <= max) return t
  const cut = t.slice(0, max - 3)
  const space = cut.search(/\s\S*$/)
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:(-]+$/, '')}...`
}

// Reviewers number their own findings; make every id unique.
function uniqueIds(findings) {
  const seen = {}
  return findings.map(f => {
    seen[f.id] = (seen[f.id] || 0) + 1
    return seen[f.id] === 1 ? f : { ...f, id: `${f.id}${String.fromCharCode(96 + seen[f.id])}` }
  })
}

// The writer gets every ruling exactly as the judge wrote it, each in a tilde fence longer than any inside it.
const fenced = text => {
  const fence = '~'.repeat(Math.max(3, ...(text.match(/^ *~+/gm) || []).map(run => run.trim().length)) + 1)
  return [fence, text.replace(/\s+$/, ''), fence].join('\n')
}
const rulingText = r => [
  r.ruling === 'accept' ? `Sections: ${r.sections.join(', ') || 'none named'}` : '',
  `Reason: ${r.reason}`,
  r.ruling === 'accept' ? `Change:\n${r.change}` : '',
  r.ruling === 'ask' ? `Question:\n${r.question}` : '',
].filter(Boolean).join('\n')
const lensesOf = (ids, lensOf) => [...new Set(ids.map(id => lensOf[id] || 'unknown lens'))].join(', ')
const renderRulings = (rulings, lensOf, none) => rulings.length === 0
  ? none
  : rulings.map((r, i) => [
      `#### ${i + 1}. ${r.findings.join(', ')} (${lensesOf(r.findings, lensOf)}; ${r.severity}): ${r.ruling}`,
      '',
      fenced(rulingText(r)),
    ].join('\n')).join('\n\n')

// ---------- Markdown for the report ----------
// The script writes the report from the findings and the rulings, so no agent spends tokens composing it: an agent
// only saves it. It keeps the rules of these documents: no em dash, and one sentence per line of prose, where a
// sentence ends at . ! or ? (not an ellipsis or an abbreviation), any closing quotes or brackets, then space before a
// capital or inline code. Fenced code, tables, headings and HTML stay as written.
const EM_DASH = String.fromCharCode(0x2014)
const FENCE = /^\s*(`{3,}|~{3,})/
const UNSPLITTABLE = /^\s*(?:#|\||<|\[[^\]]+\]:)/
const SENTENCE_END = /(?<!\.)[.!?]["'”’)\]*_]*\s+(?=["'“‘(\[*_]*(?:\p{Lu}|`))/gu
const ABBREVIATION = /\b(?:e\.g|E\.g|i\.e|I\.e|vs|cf|approx|Dr|Mr|Mrs|Ms|St|Fig|Eq|Sec|No|\p{Lu})\.$/u
const sentences = text => {
  const masked = text.replace(/(`+)[\s\S]*?\1/g, code => 'X'.repeat(code.length))
  const pieces = []
  let start = 0
  for (const end of masked.matchAll(SENTENCE_END)) {
    if (ABBREVIATION.test(masked.slice(0, end.index + 1))) continue
    pieces.push(text.slice(start, end.index + end[0].trimEnd().length))
    start = end.index + end[0].length
  }
  return [...pieces, text.slice(start)]
}
// A heading in an agent's text would break the report's outline, so it becomes a bold line.
const prose = text => {
  let fence = null
  return String(text || '').split(EM_DASH).join('-').replace(/\r\n?/g, '\n').trim().split('\n').map(raw => {
    const marker = (raw.match(FENCE) || [])[1]
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null
      return raw
    }
    if (marker) { fence = marker; return raw }
    const line = raw.replace(/^(\s*)#{1,6}\s+(.*?)[\s#]*$/, (_, space, title) => `${space}**${title.replace(/\*\*/g, '')}**`)
    if (UNSPLITTABLE.test(line)) return line
    const lead = line.match(/^\s*(?:>\s?)*(?:(?:[-*+]|\d+[.)])\s+)?/)[0]
    const hang = lead.replace(/(?:[-*+]|\d+[.)])\s+$/, bullet => ' '.repeat(bullet.length))
    return sentences(line.slice(lead.length)).map((s, i) => `${i ? hang : lead}${s.trim()}`).join('\n')
  }).join('\n')
}
// A list item: the head, then the text on the same line when it starts as prose, and the rest indented under it.
const item = (head, text, indent = '') => {
  const lines = prose(text).split('\n')
  if (!lines[0]) return ''
  const inline = !/^\s*(?:`{3,}|~{3,}|#|\||<|>|[-*+]\s|\d+[.)]\s)/.test(lines[0])
  return [
    `${indent}- ${[head, inline ? lines[0] : ''].filter(Boolean).join(' ')}`,
    ...(inline ? lines.slice(1) : lines).map(line => (line ? `${indent}  ${line}` : '')),
  ].join('\n')
}
const field = (label, text, indent) => item(`**${label}:**`, text, indent)
// Evidence quotes the plan or the code: when it spans lines or holds code, it goes in a fence, as written.
const quoted = text => {
  const t = String(text || '').replace(/\s+$/, '').replace(/^\s*\n/, '')
  return t.includes('\n') || /[{};]|=>/.test(t) ? fenced(t) : t
}
// A table cell: the first paragraph, on one line, so no code or list lands in a table.
const cell = (text, max = 200) => clip(String(text || '').trim().split(/\n\s*\n/)[0].split(EM_DASH).join('-').replace(/\s+/g, ' '), max).replace(/\|/g, '\\|')
// An agent may give the revision with its date ("3, 2026-10-13"): the number is what is reported.
const revisionOf = value => (String(value || '').match(/\d+/) || [String(value || '')])[0]
const where = f => `\`${[f.file, f.lines].filter(Boolean).join(':')}\``

// acceptEdits mode is not enough: it allows writes only in the folder the session started in, and no reads outside it.
const ALLOW = "allow the workflow's reads and writes in advance: use auto mode, or add the rules `Read(~/.claude/plugins/**)` (the agents read their plugins' reference files) and `Edit(//**/cc-docs/**)` (they write the plan and the reports) to `permissions.allow` in `~/.claude/settings.json`"
const MOVE = 'Move the documents with `git mv .claude/docs cc-docs`, then run the review again.'

// ---------- rounds ----------
let today = input.date || ''
let changes = focusInput
let touched = []
let seriousIds = []
let expected = 0
let unreviewed = 0
let stopped = ''
const rounds = []
log(`Models: ${thorough ? 'the session\'s model reviews, verifies, judges and revises' : 'Sonnet reviews and verifies, the session\'s model judges and revises'}, and Haiku loads, checks access and saves the reports.`)

for (let pass = 1; pass <= maxRounds; pass++) {
  // ---------- Load ----------
  phase('Load')
  const ctx = await agent(
    `Prepare ${expected ? `round ${expected}` : 'a round'} of a feature plan review. Read only; do not modify anything.
The plan contract is \`references/feature-plan.md\` in the devflow plugin; you only need what is below.

1. repoRoot: the repository root (\`git rev-parse --show-toplevel\`, or the current directory).
2. planPath: ${target
    ? `the plan for "${target}": the path itself if it is a file, else \`cc-docs/plans/${target}.md\`, else the closest match under \`cc-docs/plans/\`.`
    : 'the only plan under `cc-docs/plans/`, or the most recently modified one; say which and why in `note`.'}
   Give it relative to the repository root. If there is no plan, return planPath empty and explain in \`note\`.
3. feature: the plan's file name without \`.md\`. today: ${today || 'today as YYYY-MM-DD (`date +%F`, or `Get-Date -Format yyyy-MM-dd`)'}.
4. status and revision: from the plan's header lines \`> Status:\` and \`> Revision:\` (the revision number only); status \`unknown\` if there is none.
5. profilePath: \`cc-docs/architecture.md\` under the repository root if it exists, else empty.
6. sources: the files named on the plan's \`> Source:\` line that exist (skip the request text). designDir: the design directory under \`cc-docs/design/\` among them, else empty.
7. stale: the sources modified after the plan (compare modification times with \`ls -l --time-style=full-iso\` or \`Get-Item\`).
8. useCases: every \`UC-n\` in the plan's §3, with its id, its name, and a one-line summary that names its failures.
9. missing: the sections the plan lacks, of: 1 Goal, 2 Scope, 3 Use Cases, 4 Architecture Impact, 5 Domain Model Impact, 6 Phases, 7 Verification, 8 Risks, Assumptions and Open Questions, 9 Decision Log.
10. openQuestions: the \`Q-n\` ids still open in §8.
11. lastRound: the highest n among the \`#### Round <n>, ...\` headings in §9, or 0 if there are none.
12. legacyDocs: whether \`.claude/docs/\` under the repository root holds \`architecture.md\`, \`design/\`, \`plans/\` or \`reviews/\` (documents from an earlier version of these plugins).`,
    { schema: LOAD, label: expected ? `load round ${expected}` : 'load', phase: 'Load', ...ROLES.mechanical },
  )
  if (pass === 1) {
    if (!ctx || !ctx.planPath) {
      if (ctx && ctx.legacyDocs) return `review-plan: ${ctx.note} The documents are still in \`.claude/docs/\`, where workflow agents cannot write. ${MOVE}`
      return `review-plan: ${ctx ? ctx.note : 'the load agent failed'}. Write the plan first with /devflow:plan-feature.`
    }
    if (/(^|[\\/])\.claude[\\/]/.test(ctx.planPath)) return `review-plan: the plan \`${ctx.planPath}\` is under \`.claude/\`, where workflow agents cannot write. ${MOVE}`
    if (ctx.legacyDocs) log('`.claude/docs/` still exists next to `cc-docs/`: move what it still holds into `cc-docs/`.')
  } else if (!ctx || !ctx.planPath) {
    stopped = `the plan could not be loaded for round ${expected}${ctx ? `: ${ctx.note}` : ''}`
    break
  }
  today = today || ctx.today
  const round = (Math.floor(Number(ctx.lastRound)) || 0) + 1
  if (expected && round !== expected) {
    stopped = `§9 of the plan does not record round ${expected - 1}, so round ${expected} was not run`
    break
  }
  const plan = ctx.planPath
  const feature = ctx.feature
  const canRevise = REVISABLE.includes(ctx.status)
  // A round after the first in this run re-reviews serious changes: it rules only on critical and major findings.
  const rereview = pass > 1
  const roundLenses = rereview ? lensesFor(touched) : focusInput ? lensesFor([focusInput]) : lenses
  // Each round has its own report: a round never re-types an earlier one to append to it.
  const reportName = `${feature}-plan-review-${today}-round-${round}.md`
  const reportFile = `cc-docs/reviews/${reportName}`
  const reportPath = `${ctx.repoRoot}/${reportFile}`
  const profileNote = ctx.profilePath
    ? `The project profile is \`${ctx.profilePath}\`: apply its precedence to every finding's status.`
    : 'There is no project profile: every finding is a violation.'
  log(`Round ${round} (${pass} of at most ${maxRounds} in this run) on ${plan} (${ctx.status}, revision ${revisionOf(ctx.revision)}): ${ctx.useCases.length} use cases, lenses ${roundLenses.join(', ')}, ${votes} ${votes === 1 ? 'skeptic' : 'skeptics'} per lens. ${ctx.stale.length ? `Stale inputs: ${ctx.stale.join(', ')}.` : ''}${ctx.missing.length ? ` Missing sections: ${ctx.missing.join(', ')}.` : ''}`)
  if (!canRevise) log(`The plan is ${ctx.status}: this review reports, and does not revise it.`)
  if (ctx.status === 'approved') log('The plan was approved; revising it sets it back to reviewed, and it needs the user\'s approval again.')

  if (pass === 1) {
    const [read, write] = await parallel([
      () => agent(
        `This is an access check, not a review: do only this.
Read the first reference file your instructions list, from your plugin's folder, with one Read call.
Return whether the Read worked, the path you read, and the refusal word for word if it was refused. If the Read is refused, do not try another way.`,
        { agentType: 'devflow:plan-reviewer', schema: READABLE, label: 'read check', phase: 'Load', ...ROLES.mechanical },
      ),
      () => agent(
        `Create the file \`${reportPath}\` with one Write call, with exactly the text between the markers, without the markers.
It marks a review round in progress, and the round's report replaces it.
Do nothing else. If the Write is refused, do not try another way: return written false, with the refusal word for word.
<<<TEXT
# Plan Review: ${feature}

## Round ${round}, ${today}

This review round has not finished.
Its report replaces this text, so if this text is still here, the run stopped before the end of the round.
TEXT>>>`,
        { schema: WRITTEN, label: 'write check', phase: 'Load', ...ROLES.mechanical },
      ),
    ])
    if (!read || !write) return 'review-plan: the access check failed, so nothing was reviewed. Run the review again.'
    const refused = [
      ...(read.read ? [] : [`a read of \`${read.path}\`${read.error ? ` (${clip(read.error, 300)})` : ''}`]),
      ...(write.written ? [] : [`the write to \`${reportPath}\`${write.error ? ` (${clip(write.error, 300)})` : ''}`]),
    ]
    if (refused.length) {
      return `review-plan stopped before reviewing: Claude Code refused ${refused.join(', and ')}.
Workflow agents run in the background and cannot ask for your approval, so ${ALLOW}.
Then run the review again.`
    }
  }

  // ---------- checks ----------
  const focus = round === 1 ? '' : `This is review round ${round}. The plan's §9 records every ruling of the earlier rounds and the user's answers.
${changes ? `Changes made since round ${round - 1}: ${changes}
${rereview && seriousIds.length ? `This round exists to check the critical and major ones: ${seriousIds.join(', ')}.\n` : ''}Review the revised plan, but report only problems in these changes or caused by them, and critical problems that earlier rounds missed.` : 'Review the revised plan, and report only problems the earlier rounds did not rule on.'}
Do not raise again a finding that §9 records as rejected or asked, unless a change made it worse.`
  const common = [
    profileNote,
    ctx.designDir ? `The plan builds on the design directory \`${ctx.designDir}\`: it must not contradict it without saying so.` : '',
    ctx.stale.length ? `These inputs changed after the plan was written; check the plan against their current content: ${ctx.stale.join(', ')}.` : '',
    focus,
    'You are one of several independent reviewers, each with a different lens: stay inside yours, and report what you find without softening it.',
    `Cite the plan as \`file: "${plan} §<section>"\` with \`lines\` empty and the plan text quoted in \`evidence\`; cite code as \`file\` and \`lines\`, read in this session.`,
  ].filter(Boolean).join('\n')
  const checks = []
  if (roundLenses.includes('lowy')) {
    checks.push({
      key: 'lowy',
      lens: 'lowy',
      prompt: `Plan mode: review the feature plan \`${plan}\` through Löwy's Method, covering §3 use cases, §4 architecture impact, and the phases in §6 that add or change services.
Check the plan against the code as it is: inventory only the services §4.1 names and the services they call (the profile's Mapping first), so you can tell whether each change sits in the service that owns it.
Check each new or changed service's layer and name; the 12 Design Don'ts and the closed architecture on the new call paths; the event rules for §4.4; whether §4.2 names the right axis of volatility and the change stays inside the service that encapsulates it (a feature that ripples across several services, into the contracts between them or into Clients signals a missing or wrong encapsulation); that every new service encapsulates an axis of volatility (no service per feature or per entity); the Managers-to-Engines balance after the change; and symmetry with the existing use cases most like the new ones.
${common}
Return findings with \`lens: "lowy"\` and ids \`L-n\`. Put the services the plan touches, with their layers, and a one-line verdict in \`summary\`.`,
    })
  }
  if (roundLenses.includes('chains') && ctx.useCases.length) {
    // One reviewer traces every use case, so the plan, the rules and the code are read once; --thorough gives each its own.
    for (const group of thorough ? ctx.useCases.map(uc => [uc]) : [ctx.useCases]) {
      const one = group.length === 1
      checks.push({
        key: thorough ? `chains ${group[0].id}` : 'chains',
        lens: 'chains',
        prompt: `Plan mode: validate ${one ? `use case ${group[0].id}` : 'the use cases'} of the feature plan \`${plan}\`:
${group.map(uc => `- ${uc.id} "${uc.name}": ${uc.summary}`).join('\n')}
For ${one ? 'it' : 'each'}, trace the chain the plan proposes in §4.3 hop by hop: existing services in code mode (cite \`file:line\` for each hop), services the plan adds in design mode (cite the plan section).
Check every hop against the closed architecture, the Design Don'ts and the event rules; check that the chain completes its use case, including each failure §3 lists; compare ${one ? 'it' : 'the chains with each other and'} with the chains of the existing use cases most like ${one ? 'it' : 'them'} (symmetry).
${common}
Return findings with \`lens: "chains"\` and ids \`C-<use case number>.<n>\` (\`C-2.1\` is the first finding on UC-2). Put ${one ? 'the chain and its verdict' : 'each chain and its verdict'} in \`summary\`.`,
      })
    }
  }
  if (roundLenses.includes('dmf')) {
    checks.push({
      key: 'dmf',
      lens: 'dmf',
      prompt: `Plan mode: review the domain model impact of the feature plan \`${plan}\` in C# terms, covering §5 (types, workflows, errors, boundaries), the failures in §3, and the phases in §6 that implement them.
Read the existing domain types the plan uses or extends (the profile's domain folders first), so you can tell whether the new types fit them and reuse them instead of duplicating them.
Check: illegal states the proposed types still allow (name the nonsense combination), primitive obsession, smart constructors as the only way in, a type per lifecycle stage, closed unions consumed totally, workflow signatures that state their effects and dependencies, one domain error case per failure in §3, I/O kept at the edges, DTO and persistence changes with a version on persisted data, and the ubiquitous language.
${common}
Return findings with \`lens: "dmf"\` and ids \`D-n\`. Put a short overview in \`summary\`.`,
    })
  }
  if (roundLenses.includes('plan')) {
    checks.push({
      key: 'plan',
      lens: 'plan',
      prompt: `Review the feature plan \`${plan}\` for delivery, with every check in your instructions.
${common}
Return findings with \`lens: "plan"\` and ids \`P-n\`. Put a one-line verdict in \`summary\`: can a developer agent build it phase by phase, and can a QA agent check every phase?`,
    })
  }
  if (roundLenses.includes('chains') && ctx.useCases.length === 0) log('§3 lists no use cases, so no call chain was checked.')
  log(`${checks.length} reviewers.`)

  // Only critical and major violations are worth a skeptic; the rest go to the judge as found. One skeptic takes all
  // of a reviewer's serious findings, so the plan, the code and the rules are read once per lens.
  const notVerified = f => ({ ...f, verification: f.status === 'violation' ? 'not verified (minor)' : 'not verified (not a violation)' })
  const verify = async (findings, check) => {
    const serious = findings.filter(f => f.status === 'violation' && isSerious(f))
    if (serious.length === 0) return findings.map(notVerified)
    const ballots = (await parallel(Array.from({ length: votes }, (_, vi) => () => agent(
      `You are verifying findings from another reviewer of the feature plan \`${plan}\`, not reviewing. Try to refute each one.
${profileNote}
For each finding, re-read the plan section it cites, then the rest of the plan: it may already be handled in another section or a later phase. Open the code it cites.
Then re-read its rule in your references, including the relaxed rules.
Refute it if the evidence is not in the plan or the code, the rule does not apply, or the plan handles it elsewhere (say where).
Answer adjusted, with the corrected status or severity, if it is real but mis-rated. When in doubt, refute.
Judge each finding on its own, and return one verdict per finding, with its id.${vi > 0 ? `\nYou are independent verifier #${vi + 1}; reach your own conclusions.` : ''}
Findings (JSON): ${JSON.stringify(serious)}`,
      { agentType: LENSES[check.lens].agentType, schema: VERDICTS, phase: 'Verify', label: `verify ${check.key}${votes > 1 ? ` #${vi + 1}` : ''}${round > 1 ? ` (round ${round})` : ''}`, ...ROLES.verify },
    )))).filter(Boolean)
    return findings.map(f => {
      if (!serious.includes(f)) return notVerified(f)
      const answers = ballots.map(b => (b.verdicts || []).find(v => v.id === f.id)).filter(Boolean)
      if (answers.length === 0) return { ...f, verification: 'unverified', reason: 'no verifier answered' }
      const upheld = answers.filter(v => v.verdict !== 'refuted')
      if (upheld.length * 2 <= answers.length) return { ...f, verification: 'refuted', reason: answers.map(v => v.reason).join(' | ') }
      return { ...f, status: upheld[0].status, severity: upheld[0].severity, verification: upheld[0].verdict, reason: upheld[0].reason }
    })
  }

  // ---------- Review and Verify ----------
  const results = await pipeline(
    checks,
    c => agent(c.prompt, { agentType: LENSES[c.lens].agentType, schema: CHECK, phase: 'Review', label: `${c.key}${round > 1 ? ` (round ${round})` : ''}`, ...ROLES.review }),
    async (res, c) => {
      if (!res) return { key: c.key, res: null, findings: [] }
      const own = uniqueIds(res.findings.map(f => ({ ...f, lens: c.lens, id: round > 1 ? `R${round}-${f.id}` : f.id })))
      return { key: c.key, res, findings: await verify(own, c) }
    },
  )

  const done = results.filter(Boolean)
  const failed = done.filter(r => !r.res).map(r => r.key)
  if (failed.length) log(`Reviews that failed and are missing: ${failed.join(', ')}.`)
  const all = uniqueIds(done.flatMap(r => r.findings))
  const kept = all.filter(f => f.verification !== 'refuted')
  const refuted = all.filter(f => f.verification === 'refuted')
  // A re-review round rules only on critical and major findings; its minor findings and nits go to the report.
  const toJudge = rereview ? kept.filter(isSerious) : kept
  const deferred = rereview ? kept.filter(f => !isSerious(f)) : []
  const summaries = done.filter(r => r.res).map(r => ({ check: r.key, summary: r.res.summary }))
  log(`${all.length} findings, ${kept.length} kept, ${refuted.length} refuted.${deferred.length ? ` ${deferred.length} minor findings and nits go to the report without a ruling.` : ''}`)

  // ---------- Judge (barrier: rulings need every finding, to merge them and settle conflicts) ----------
  let judged = { rulings: [], conflicts: [], notes: '', summary: '' }
  if (toJudge.length) {
    phase('Judge')
    judged = await agent(
      `Rule on the findings of review round ${round} of the feature plan \`${plan}\`.
${profileNote}
Each finding's \`verification\` says whether it survived adversarial verification, was adjusted, or was not verified because it is minor.
${round > 1 ? 'Earlier rounds\' rulings and the user\'s answers are in the plan\'s §9; do not overturn an earlier ruling without new evidence.' : ''}
Reviewer summaries (JSON):
${JSON.stringify(summaries, null, 1)}

Findings (JSON):
${JSON.stringify(toJudge, null, 1)}`,
      { agentType: 'devflow:plan-judge', schema: RULINGS, phase: 'Judge', label: `judge round ${round}`, ...ROLES.judge },
    )
    if (!judged) log('The judge failed: the plan is not revised, and the report lists the findings without rulings.')
  }
  const rulings = judged ? judged.rulings : []
  const ruled = new Set(rulings.flatMap(r => r.findings))
  const unruled = toJudge.map(f => f.id).filter(id => !ruled.has(id))
  if (judged && unruled.length) log(`No ruling covers ${unruled.join(', ')}; they go to the report, not into the plan.`)
  const count = kind => rulings.filter(r => r.ruling === kind).length
  const serious = rulings.filter(r => r.ruling === 'accept' && isSerious(r))
  const revise = canRevise && judged !== null
  const last = pass === maxRounds
  const clean = deferred.length ? 'No critical or major finding survived verification.' : 'No findings survived verification.'

  // ---------- Revise and Report (the writer and the report's save run side by side) ----------
  phase('Revise')
  const lensOf = Object.fromEntries(all.map(f => [f.id, f.lens]))
  const findingOf = Object.fromEntries(all.map(f => [f.id, f]))
  const writerPrompt = `Mode: Revise. Plan: \`${plan}\`. Round: ${round}. Date: ${today}. Report file name: \`${reportName}\`.
Put your change list in \`changes\`: the next review round gets it.

The judge's rulings, in order:

${renderRulings(rulings, lensOf, clean)}`

  const accepted = rulings.filter(r => r.ruling === 'accept').sort(bySeverity)
  const asked = rulings.filter(r => r.ruling === 'ask')
  const rejected = rulings.filter(r => r.ruling === 'reject')
  const lensRows = [...new Set([...roundLenses, ...all.map(f => f.lens)])].map(lens => {
    const ofLens = kept.filter(f => f.lens === lens)
    return `| ${LENSES[lens] ? LENSES[lens].name : lens} | ${SEVERITIES.map(s => ofLens.filter(f => f.severity === s).length).join(' | ')} | ${refuted.filter(f => f.lens === lens).length} |`
  })
  const findingDetail = (f, indent, withFix) => [
    item(`**${f.id}** (${f.lens}; ${f.severity}):`, `${cell(f.rule, 120)}, at ${where(f)}.`, indent),
    field('Evidence', quoted(f.evidence), `${indent}  `),
    field('Problem', f.problem, `${indent}  `),
    withFix ? field('Proposed fix', f.fix, `${indent}  `) : '',
    field('Verification', `${f.verification}${f.reason ? `: ${f.reason}` : ''}`, `${indent}  `),
  ].filter(Boolean).join('\n')
  // Numbered as in the Rulings table, the writer's prompt and §9.
  const rulingDetail = (r, fields) => [
    `#### ${rulings.indexOf(r) + 1}. ${MARKS[r.severity] || ''} ${r.findings.join(', ')} (${lensesOf(r.findings, lensOf)}; ${r.severity})`,
    fields.filter(Boolean).join('\n'),
    'The findings:',
    r.findings.map(id => (findingOf[id] ? findingDetail(findingOf[id], '', false) : `- **${id}**: not among this round's findings.`)).join('\n'),
  ].join('\n\n')
  const gaps = [
    ...failed.map(key => `- The ${key} review failed, so its findings are missing.`),
    unruled.length ? `- No ruling covers ${unruled.join(', ')}: ${judged ? 'they are listed below and not applied to the plan' : 'the judge failed'}.` : '',
    ctx.stale.length ? `- These inputs changed after the plan was written: ${ctx.stale.map(s => `\`${s}\``).join(', ')}.` : '',
    ctx.missing.length ? `- The plan lacks these sections: ${ctx.missing.join(', ')}.` : '',
    revise && serious.length && last ? `- The critical and major changes of this round will not be re-reviewed in this run: its round limit is ${maxRounds}.` : '',
  ].filter(Boolean)
  const outcome = [
    `${all.length} ${all.length === 1 ? 'finding' : 'findings'} from the ${roundLenses.join(', ')} ${roundLenses.length === 1 ? 'lens' : 'lenses'}: ${kept.length} kept, ${refuted.length} refuted in verification.`,
    toJudge.length === 0 ? clean
      : judged ? `The judge accepted ${count('accept')} (${serious.length} critical or major), rejected ${count('reject')}, and sent ${count('ask')} to the user.`
        : 'The judge failed, so nothing was ruled.',
    deferred.length ? `The ${deferred.length} minor findings and nits below have no ruling: a re-review round rules only on critical and major findings.` : '',
    rereview ? `This round re-reviewed the critical and major changes of round ${round - 1}${seriousIds.length ? ` (${seriousIds.join(', ')})` : ''}, with the lenses that own the sections they touched.` : '',
    !canRevise ? `The plan is ${ctx.status}, so it is not revised: every ruling below is a recommendation, and this report is its only record.`
      : revise && rulings.length ? 'The plan writer applies the rulings and logs them in the plan\'s §9, which says where each change went.' : '',
    revise && serious.length && !last ? `Round ${round + 1} re-reviews the critical and major changes once they are applied.` : '',
  ]
  // A subsection with a title and its blocks; left out when it would be empty.
  const subsection = (title, blocks) => {
    const body = blocks.filter(Boolean)
    return body.length ? [`### ${title}`, ...body].join('\n\n') : ''
  }
  const withoutRuling = [...deferred, ...kept.filter(f => unruled.includes(f.id))].sort(bySeverity)
  const report = [
    `# Plan Review: ${feature}`,
    `> Source: \`${plan}\`, ${ctx.status} at revision ${revisionOf(ctx.revision)}; profile ${ctx.profilePath ? `\`${ctx.profilePath}\`` : 'none'}; ${today}.`,
    `## Round ${round}, ${today}`,
    outcome.filter(Boolean).join('\n'),
    subsection('Kept Findings', [['| Lens | Critical | Major | Minor | Nit | Refuted |', '|---|---|---|---|---|---|', ...lensRows].join('\n')]),
    subsection('Rulings', [rulings.length ? [
      '| # | Findings | Lens | Severity | Ruling | Sections | Reason |',
      '|---|---|---|---|---|---|---|',
      ...rulings.map((r, i) => `| ${i + 1} | ${r.findings.join(', ')} | ${lensesOf(r.findings, lensOf)} | ${r.severity} | ${r.ruling} | ${cell(r.sections.join(', '), 80) || '-'} | ${cell(r.reason)} |`),
    ].join('\n') : '']),
    subsection(canRevise ? 'Accepted Changes' : 'Recommended Changes', accepted.map(r => rulingDetail(r, [
      field('Sections', r.sections.join(', ') || 'none named'),
      field('Reason', r.reason),
      field('Change', r.change),
    ]))),
    subsection('Questions for the User', asked.map(r => rulingDetail(r, [
      field('Reason', r.reason),
      field('Question', r.question),
      canRevise ? '- The plan writer adds it to §8 as an open question.' : '',
    ]))),
    subsection('Rejected', [rejected.map(r => item(`**${r.findings.join(', ')}** (${lensesOf(r.findings, lensOf)}; ${r.severity}):`, r.reason)).join('\n')]),
    subsection('Conflicts Between Lenses', [(judged ? judged.conflicts : []).map(c => item('', c)).join('\n')]),
    subsection('Judge\'s Notes', [judged ? prose(judged.notes) : '']),
    subsection('Findings Without a Ruling', [withoutRuling.map(f => findingDetail(f, '', true)).join('\n')]),
    subsection('Refuted in Verification', [refuted.map(f => item(`**${f.id}** (${f.lens}):`, `${cell(f.rule, 120)}. ${f.reason}`)).join('\n')]),
    subsection('Gaps', [gaps.join('\n')]),
    subsection('Reviewer Summaries', summaries.map(s => `#### ${s.check}\n\n${prose(s.summary)}`)),
  ].filter(Boolean).join('\n\n') + '\n'

  const reportPrompt = `Write the file \`${reportPath}\` with exactly the text between the markers, without the markers: it is the report of review round ${round} of the feature plan \`${plan}\`.
If the file exists, Read it first, since Write replaces only a file read in this session; then save the text with one Write call.
Do not change, shorten or reformat anything, and modify no other file.
If the Write is refused for permission, do not try another way: return written false, with the refusal word for word.
If a hook refuses the text's form, change only the lines it names, as it says, and write again.
<<<REPORT
${report}REPORT>>>`
  const [revision, saved] = await parallel([
    () => revise ? agent(writerPrompt, { agentType: 'devflow:plan-writer', schema: REVISION, phase: 'Revise', label: `revise round ${round}`, ...(rulings.length ? ROLES.revise : ROLES.mechanical) }) : Promise.resolve(null),
    () => agent(reportPrompt, { schema: WRITTEN, phase: 'Revise', label: `report round ${round}`, ...ROLES.mechanical }),
  ])
  const revised = Boolean(revise && revision && revision.written)
  if (revise && !revised) log(`The plan writer did not save round ${round}: ${revision ? revision.note : 'the agent failed'}.`)
  if (!saved || !saved.written) log(`The report of round ${round} was not written: ${saved ? saved.error : 'the agent failed'}.`)

  rounds.push({
    round, plan, ctx, reportFile, failed, unruled, revise, revision, saved,
    lenses: roundLenses, kept: kept.length, refuted: refuted.length, deferred: deferred.length, judged: judged !== null, toJudge: toJudge.length, ruled: rulings.length,
    summary: judged ? judged.summary : '', accepted: count('accept'), serious: serious.length, rejected: count('reject'), asked: count('ask'),
  })
  // Another round only reviews accepted critical or major changes, and only once the writer has made them.
  if (!revised || serious.length === 0) break
  if (last) { unreviewed = round; break }
  changes = revision.changes
  touched = serious.flatMap(r => r.sections)
  seriousIds = serious.flatMap(r => r.findings)
  expected = round + 1
}

// ---------- result ----------
const first = rounds[0]
const final = rounds[rounds.length - 1]
const lastSaved = [...rounds].reverse().find(r => r.revision && r.revision.written)
const status = lastSaved ? lastSaved.revision.status : final.ctx.status
const revisionNo = revisionOf(lastSaved ? lastSaved.revision.revision : final.ctx.revision)
const open = [...new Set([...final.ctx.openQuestions, ...(final.revision && final.revision.written ? final.revision.questions : [])])]

const roundLines = withSummaries => rounds.flatMap(r => [
  '',
  `Round ${r.round}${r.lenses.length < lenses.length ? ` (lenses ${r.lenses.join(', ')})` : ''}: ${r.kept} findings kept, ${r.refuted} refuted; ${!r.toJudge ? `${r.deferred ? 'none critical or major' : 'none left'}, so nothing needed a ruling` : r.judged ? `rulings: ${r.accepted} accepted (${r.serious} critical or major), ${r.rejected} rejected, ${r.asked} sent to the user` : 'the judge failed, so nothing was ruled'}.${r.deferred ? ` ${r.deferred} minor findings and nits are in the report, without a ruling.` : ''}${r.unruled.length && r.judged ? ` Without a ruling: ${r.unruled.join(', ')}.` : ''}${r.failed.length ? ` Reviews that failed: ${r.failed.join(', ')}.` : ''}`,
  r.saved && r.saved.written ? `- Report: \`${r.reportFile}\`` : `- Report: not written (${r.saved ? clip(r.saved.error, 200) : 'the report agent failed; relaunch to retry it from cached results'}).`,
  !r.revise ? `- Plan: not revised (${r.judged ? `it is ${r.ctx.status}, so every ruling is a recommendation` : 'no rulings'}).`
    : r.revision && r.revision.written && !r.ruled ? `- Plan: the round is logged in §9, at revision ${revisionOf(r.revision.revision)}.`
    : r.revision && r.revision.written ? `- Plan: revised to revision ${revisionOf(r.revision.revision)}${r.revision.questions.length ? `, with ${r.revision.questions.join(', ')} added to §8` : ''}.`
      : `- Plan: not saved (${r.revision ? clip(r.revision.note, 200) : 'the plan writer failed'}).`,
  ...(withSummaries && r.summary ? clip(r.summary.split(EM_DASH).join('-'), 900).split('\n').map(line => `  ${line}`) : []),
])

const unsaved = rounds.some(r => r.revise && !(r.revision && r.revision.written))
const next = []
if (unsaved) next.push(`The plan writer did not save its rulings, so the plan is not revised. If Claude Code refused the write, ${ALLOW}. Then run the review again.`)
if (unreviewed) next.push(`Tell the user that the critical or major changes of round ${unreviewed} were not re-reviewed: this run's round limit is ${maxRounds}.`)
if (stopped) next.push(`The run stopped early: ${stopped}.`)
if (open.length) next.push(`Ask the user the open questions in §8 (${open.join(', ')}), with their options and recommendations, and send the answers to \`devflow:plan-writer\` in Answers mode.`)
else if (REVISABLE.includes(status) && !unsaved && !unreviewed && !stopped && rounds.every(r => r.judged)) next.push('No question is open, and no critical or major change is left without a re-review: once the user has read the reports, ask for their approval of the plan.')
next.push('The plan\'s §8 and §9 hold the open questions and where each change was applied; the reports hold every finding and ruling in full.')

const compose = withSummaries => [
  `review-plan: \`${first.plan}\`, ${rounds.length === 1 ? `round ${first.round}` : `rounds ${first.round} to ${final.round}`} (at most ${maxRounds} in this run), ${today}. The plan is ${status} at revision ${revisionNo}.`,
  ...roundLines(withSummaries),
  '',
  'Next:',
  ...next.map((step, i) => `${i + 1}. ${step}`),
].join('\n')
// The caller sees only the first few kilobytes of the result: drop the summaries before the result outgrows that.
const full = compose(true)
return full.length <= 6000 ? full : compose(false)
