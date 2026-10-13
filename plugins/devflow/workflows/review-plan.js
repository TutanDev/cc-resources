export const meta = {
  name: 'review-plan',
  description: 'Review and revise a feature plan, round by round: blind Löwy, call-chain, DMF and delivery reviewers, adversarial verification of their findings, a judge that accepts, rejects or asks the user about each, the plan writer applying the rulings, and a report per round',
  whenToUse: 'After a feature plan exists in cc-docs/plans/ and before the user approves it; pass the feature name or plan path, plus --thorough, --lenses=lowy,chains,dmf,plan, --rounds=N or --date=YYYY-MM-DD. The devflow:plan-feature skill runs it, then takes the user\'s answers and approval',
  phases: [
    { title: 'Load', detail: 'plan, status, profile, design sources, use cases, last round' },
    { title: 'Review', detail: 'one blind reviewer per lens, and one per use case for call chains' },
    { title: 'Verify', detail: 'skeptics try to refute critical and major findings' },
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
const votes = input.thorough ? 3 : 1
// The rounds this run may take: each round after the first reviews the critical and major changes of the one before.
const maxRounds = Math.max(1, Math.floor(Number(input.rounds)) || 2)
// What changed since the plan's last review round, such as the user's answers; only a structured call can pass it.
const focusInput = String(input.focus || '').trim()
// A review never rewrites a plan that is being built or is built: it only reports.
const REVISABLE = ['draft', 'reviewed', 'approved']

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
const VERDICT = {
  type: 'object',
  required: ['verdict', 'status', 'severity', 'reason'],
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'adjusted', 'refuted'] },
    status: STATUS,
    severity: SEVERITY,
    reason: { type: 'string' },
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
    written: { type: 'boolean', description: 'whether the plan file was saved' },
    status: { type: 'string', description: 'the status the plan was left at' },
    revision: { type: 'string', description: 'the revision number the plan was left at' },
    changes: { type: 'string', description: 'one line per accepted ruling: <finding ids>: <what changed> (<sections>)' },
    questions: { ...STRINGS, description: 'the Q-n ids added to §8' },
    note: { type: 'string', description: 'why the plan was not saved, word for word; else anything the caller must know, or empty' },
  },
}
const REPORT = {
  type: 'object',
  required: ['written', 'error', 'summary'],
  properties: {
    ...WRITTEN.properties,
    summary: { type: 'string', description: 'Markdown, at most 6 lines' },
  },
}

// ---------- helpers ----------
const isSerious = f => f.severity === 'critical' || f.severity === 'major'
// Shortens text for the result at a word boundary, without a final period: the result's own sentence ends it.
const clip = (text, max) => {
  const t = String(text || '').trim().replace(/\.+$/, '')
  if (t.length <= max) return t
  const cut = t.slice(0, max - 3)
  const space = cut.search(/\s\S*$/)
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:(-]+$/, '')}...`
}

// Reviewers number their own findings; make every id unique across lenses.
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
const renderRulings = (rulings, lensOf) => rulings.length === 0
  ? 'No findings survived verification.'
  : rulings.map((r, i) => [
      `#### ${i + 1}. ${r.findings.join(', ')} (${[...new Set(r.findings.map(id => lensOf[id] || 'unknown lens'))].join(', ')}; ${r.severity}): ${r.ruling}`,
      '',
      fenced(rulingText(r)),
    ].join('\n')).join('\n\n')

// acceptEdits mode is not enough: it allows writes only in the folder the session started in, and no reads outside it.
const ALLOW = "allow the workflow's reads and writes in advance: use auto mode, or add the rules `Read(~/.claude/plugins/**)` (the agents read their plugins' reference files) and `Edit(//**/cc-docs/**)` (they write the plan and the reports) to `permissions.allow` in `~/.claude/settings.json`"
const MOVE = 'Move the documents with `git mv .claude/docs cc-docs`, then run the review again.'

// ---------- rounds ----------
let today = input.date || ''
let changes = focusInput
let expected = 0
let unreviewed = 0
let stopped = ''
const rounds = []

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
    { schema: LOAD, label: expected ? `load round ${expected}` : 'load', phase: 'Load' },
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
  // Each round has its own report: a round never re-types an earlier one to append to it.
  const reportName = `${feature}-plan-review-${today}-round-${round}.md`
  const reportFile = `cc-docs/reviews/${reportName}`
  const reportPath = `${ctx.repoRoot}/${reportFile}`
  const profileNote = ctx.profilePath
    ? `The project profile is \`${ctx.profilePath}\`: apply its precedence to every finding's status.`
    : 'There is no project profile: every finding is a violation.'
  log(`Round ${round} (${pass} of at most ${maxRounds} in this run) on ${plan} (${ctx.status}, revision ${ctx.revision}): ${ctx.useCases.length} use cases, lenses ${lenses.join(', ')}, ${votes}-vote verification. ${ctx.stale.length ? `Stale inputs: ${ctx.stale.join(', ')}.` : ''}${ctx.missing.length ? ` Missing sections: ${ctx.missing.join(', ')}.` : ''}`)
  if (!canRevise) log(`The plan is ${ctx.status}: this review reports, and does not revise it.`)
  if (ctx.status === 'approved') log('The plan was approved; revising it sets it back to reviewed, and it needs the user\'s approval again.')

  if (pass === 1) {
    const [read, write] = await parallel([
      () => agent(
        `This is an access check, not a review: do only this.
Read the first reference file your instructions list, from your plugin's folder, with one Read call.
Return whether the Read worked, the path you read, and the refusal word for word if it was refused. If the Read is refused, do not try another way.`,
        { agentType: 'devflow:plan-reviewer', schema: READABLE, label: 'read check', phase: 'Load' },
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
        { schema: WRITTEN, label: 'write check', phase: 'Load' },
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
Review the revised plan, but report only problems in these changes or caused by them, and critical problems that earlier rounds missed.` : 'Review the revised plan, and report only problems the earlier rounds did not rule on.'}
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
  if (lenses.includes('lowy')) {
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
  if (lenses.includes('chains')) {
    ctx.useCases.forEach((uc, i) => checks.push({
      key: `chains ${uc.id}`,
      lens: 'chains',
      prompt: `Plan mode: validate use case ${uc.id} "${uc.name}" of the feature plan \`${plan}\`. ${uc.summary}
Trace the chain the plan proposes in §4.3 hop by hop: existing services in code mode (cite \`file:line\` for each hop), services the plan adds in design mode (cite the plan section).
Check every hop against the closed architecture, the Design Don'ts and the event rules; check that the chain completes the use case, including each failure §3 lists; compare it with the chains of the existing use cases most like it (symmetry).
${common}
Return findings with \`lens: "chains"\` and ids \`C-${i + 1}.n\`. Put the chain and its verdict in \`summary\`.`,
    }))
  }
  if (lenses.includes('dmf')) {
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
  if (lenses.includes('plan')) {
    checks.push({
      key: 'plan',
      lens: 'plan',
      prompt: `Review the feature plan \`${plan}\` for delivery, with every check in your instructions.
${common}
Return findings with \`lens: "plan"\` and ids \`P-n\`. Put a one-line verdict in \`summary\`: can a developer agent build it phase by phase, and can a QA agent check every phase?`,
    })
  }
  if (lenses.includes('chains') && ctx.useCases.length === 0) log('§3 lists no use cases, so no call chain was checked.')
  log(`${checks.length} reviewers.`)

  const verifyFinding = (f, check) => {
    // Only critical and major violations are worth a skeptic; the rest go to the judge as found.
    if (f.status !== 'violation' || !isSerious(f)) return Promise.resolve({ ...f, verification: 'not verified (minor)' })
    return parallel(Array.from({ length: votes }, (_, vi) => () => agent(
      `You are verifying a finding from another reviewer of the feature plan \`${plan}\`, not reviewing. Try to refute it.
${profileNote}
Re-read the cited plan section, then the rest of the plan: the finding may already be handled in another section or a later phase. Open the code the finding cites.
Then re-read the rule in your references, including the relaxed rules.
Refute it if the evidence is not in the plan or the code, the rule does not apply, or the plan handles it elsewhere (say where).
Answer adjusted, with the corrected status or severity, if it is real but mis-rated. When in doubt, refute.
${vi > 0 ? `You are independent verifier #${vi + 1}; reach your own conclusion.` : ''}
Finding (JSON): ${JSON.stringify(f)}`,
      { agentType: LENSES[check.lens].agentType, schema: VERDICT, phase: 'Verify', label: `verify ${f.id}${votes > 1 ? `.${vi + 1}` : ''}` },
    ))).then(results => {
      const ballots = results.filter(Boolean)
      if (ballots.length === 0) return { ...f, verification: 'unverified', reason: 'no verifier answered' }
      const upheld = ballots.filter(b => b.verdict !== 'refuted')
      if (upheld.length * 2 <= ballots.length) return { ...f, verification: 'refuted', reason: ballots.map(b => b.reason).join(' | ') }
      return { ...f, status: upheld[0].status, severity: upheld[0].severity, verification: upheld[0].verdict, reason: upheld[0].reason }
    })
  }

  // ---------- Review and Verify ----------
  const results = await pipeline(
    checks,
    c => agent(c.prompt, { agentType: LENSES[c.lens].agentType, schema: CHECK, phase: 'Review', label: `${c.key}${round > 1 ? ` (round ${round})` : ''}` }),
    async (res, c) => {
      if (!res) return { key: c.key, res: null, findings: [] }
      const own = res.findings.map(f => ({ ...f, lens: c.lens, id: round > 1 ? `R${round}-${f.id}` : f.id }))
      const findings = await parallel(own.map(f => () => verifyFinding(f, c)))
      return { key: c.key, res, findings: findings.map((f, i) => f || { ...own[i], verification: 'unverified', reason: 'verifier failed' }) }
    },
  )

  const done = results.filter(Boolean)
  const failed = done.filter(r => !r.res).map(r => r.key)
  if (failed.length) log(`Reviews that failed and are missing: ${failed.join(', ')}.`)
  const all = uniqueIds(done.flatMap(r => r.findings))
  const kept = all.filter(f => f.verification !== 'refuted')
  const refuted = all.filter(f => f.verification === 'refuted')
  const summaries = done.filter(r => r.res).map(r => ({ check: r.key, summary: r.res.summary }))
  log(`${all.length} findings, ${kept.length} kept, ${refuted.length} refuted.`)

  // ---------- Judge (barrier: rulings need every finding, to merge them and settle conflicts) ----------
  let judged = { rulings: [], conflicts: [], notes: '', summary: 'No findings survived verification.' }
  if (kept.length) {
    phase('Judge')
    judged = await agent(
      `Rule on the findings of review round ${round} of the feature plan \`${plan}\`.
${profileNote}
Each finding's \`verification\` says whether it survived adversarial verification, was adjusted, or was not verified because it is minor.
${round > 1 ? 'Earlier rounds\' rulings and the user\'s answers are in the plan\'s §9; do not overturn an earlier ruling without new evidence.' : ''}
Reviewer summaries (JSON):
${JSON.stringify(summaries, null, 1)}

Findings (JSON):
${JSON.stringify(kept, null, 1)}`,
      { agentType: 'devflow:plan-judge', schema: RULINGS, phase: 'Judge', label: `judge round ${round}` },
    )
    if (!judged) log('The judge failed: the plan is not revised, and the report lists the findings without rulings.')
  }
  const rulings = judged ? judged.rulings : []
  const ruled = new Set(rulings.flatMap(r => r.findings))
  const unruled = judged ? kept.map(f => f.id).filter(id => !ruled.has(id)) : kept.map(f => f.id)
  if (judged && unruled.length) log(`No ruling covers ${unruled.join(', ')}; they go to the report, not into the plan.`)
  const count = kind => rulings.filter(r => r.ruling === kind).length
  const serious = rulings.filter(r => r.ruling === 'accept' && isSerious(r))
  const revise = canRevise && judged !== null
  const last = pass === maxRounds

  // ---------- Revise and Report (the writer and the report agent both work from the rulings, side by side) ----------
  phase('Revise')
  const lensOf = Object.fromEntries(all.map(f => [f.id, f.lens]))
  const writerPrompt = `Mode: Revise. Plan: \`${plan}\`. Round: ${round}. Date: ${today}. Report file name: \`${reportName}\`.
Put your change list in \`changes\`: the next review round gets it.

The judge's rulings, in order:

${renderRulings(rulings, lensOf)}`
  const reportPrompt = `Write the report of review round ${round} of the feature plan \`${plan}\` to \`${reportPath}\`, with one Write call${pass === 1 ? ': it replaces the placeholder there' : ''}.
Modify no other file. If the Write is refused, do not try another way: return written false, with the refusal word for word.
Read the plan only to quote the text the findings cite.
Write the Markdown with one full sentence per line, and no em dash.
Then return a summary of at most 6 lines: the outcome, the accepted critical and major changes, and what the user must decide.

Context: plan \`${plan}\`, ${ctx.status} at revision ${ctx.revision}; date ${today}; profile ${ctx.profilePath || 'none'}; lenses ${lenses.join(', ')}; ${votes}-vote verification of critical and major violations; round ${round}.
${revise ? 'The plan writer applies the rulings while you write: describe accepted changes as rulings to apply, not as changes made, and leave the exact edits to the plan, whose §9 logs where each was applied.' : ''}
${canRevise ? '' : `The plan is ${ctx.status}, so it is not revised: every ruling is a recommendation, and this report is its only record.`}
Stale inputs: ${ctx.stale.join(', ') || 'none'}. Missing sections: ${ctx.missing.join(', ') || 'none'}. Open questions in §8 before this round: ${ctx.openQuestions.join(', ') || 'none'}. ${ctx.note}
${revise && serious.length && !last ? `The judge accepted critical or major changes, so round ${round + 1} reviews them once the writer has applied them.` : ''}
${revise && serious.length && last ? `The judge accepted critical or major changes, and they will not be re-reviewed: this run's round limit is ${maxRounds}. Say so in the gaps.` : ''}
${judged ? '' : 'The judge failed: list the kept findings without rulings, and say so in the gaps.'}

Report structure:
0. Title \`# Plan Review: ${feature}\`, then a \`> Source:\` line with the plan path, the profile and the date.
1. Heading \`## Round ${round}, ${today}\`, then the outcome in one or two sentences: findings kept and refuted, rulings accepted, rejected and sent to the user, and what happens next.
2. A table of kept findings per lens and severity.
3. Rulings: a table of finding ids, lens, severity, ruling, a short reason and the sections to change.
4. Accepted findings, most severe first: severity mark (🔴 critical, 🟠 major, 🟡 minor, ⚪ nit), id, rule, file and section, quoted evidence, the problem, the verification verdict, and the change, ${canRevise ? 'in one or two sentences' : 'in full, as the judge wrote it'}.
5. Questions for the user, from the rulings sent to them: ${canRevise ? 'each in one or two sentences, with the judge\'s recommendation; the writer adds them to §8' : 'each in full, with its options and the judge\'s recommendation'}.
6. Rejected findings: one line each with the reason.
7. Conflicts between lenses and how the judge settled them; the judge's notes.
8. Refuted during verification: one line each (id, rule, reason).
9. Gaps: reviews that failed, findings no ruling covers, stale inputs, missing sections, changes that will not be re-reviewed.
Use \`###\` for the subsections, and leave out a subsection that would be empty.

Reviews that failed: ${failed.join(', ') || 'none'}. Findings no ruling covers: ${unruled.join(', ') || 'none'}.
Reviewer summaries (JSON):
${JSON.stringify(summaries, null, 1)}

Findings kept (JSON):
${JSON.stringify(kept, null, 1)}

Rulings (JSON):
${JSON.stringify(judged, null, 1)}

Findings refuted (JSON):
${JSON.stringify(refuted.map(f => ({ id: f.id, lens: f.lens, rule: f.rule, file: f.file, reason: f.reason })), null, 1)}`
  const [revision, report] = await parallel([
    () => revise ? agent(writerPrompt, { agentType: 'devflow:plan-writer', schema: REVISION, phase: 'Revise', label: `revise round ${round}` }) : Promise.resolve(null),
    () => agent(reportPrompt, { schema: REPORT, phase: 'Revise', label: `report round ${round}` }),
  ])
  const revised = Boolean(revise && revision && revision.written)
  if (revise && !revised) log(`The plan writer did not save round ${round}: ${revision ? revision.note : 'the agent failed'}.`)
  if (!report || !report.written) log(`The report of round ${round} was not written: ${report ? report.error : 'the agent failed'}.`)

  rounds.push({
    round, plan, ctx, reportFile, failed, unruled, revise, revision, report,
    kept: kept.length, refuted: refuted.length, judged: judged !== null,
    accepted: count('accept'), serious: serious.length, rejected: count('reject'), asked: count('ask'),
  })
  // Another round only reviews accepted critical or major changes, and only once the writer has made them.
  if (!revised || serious.length === 0) break
  if (last) { unreviewed = round; break }
  changes = revision.changes
  expected = round + 1
}

// ---------- result ----------
const first = rounds[0]
const final = rounds[rounds.length - 1]
const lastSaved = [...rounds].reverse().find(r => r.revision && r.revision.written)
const status = lastSaved ? lastSaved.revision.status : final.ctx.status
const revisionNo = lastSaved ? lastSaved.revision.revision : final.ctx.revision
const open = [...new Set([...final.ctx.openQuestions, ...(final.revision && final.revision.written ? final.revision.questions : [])])]

const roundLines = withSummaries => rounds.flatMap(r => [
  '',
  `Round ${r.round}: ${r.kept} findings kept, ${r.refuted} refuted; ${r.judged ? `rulings: ${r.accepted} accepted (${r.serious} critical or major), ${r.rejected} rejected, ${r.asked} sent to the user` : 'the judge failed, so nothing was ruled'}.${r.unruled.length && r.judged ? ` Without a ruling: ${r.unruled.join(', ')}.` : ''}${r.failed.length ? ` Reviews that failed: ${r.failed.join(', ')}.` : ''}`,
  r.report && r.report.written ? `- Report: \`${r.reportFile}\`` : `- Report: not written (${r.report ? clip(r.report.error, 200) : 'the report agent failed; relaunch to retry it from cached results'}).`,
  !r.revise ? `- Plan: not revised (${r.judged ? `it is ${r.ctx.status}, so every ruling is a recommendation` : 'no rulings'}).`
    : r.revision && r.revision.written ? `- Plan: revised to revision ${r.revision.revision}${r.revision.questions.length ? `, with ${r.revision.questions.join(', ')} added to §8` : ''}.`
      : `- Plan: not saved (${r.revision ? clip(r.revision.note, 200) : 'the plan writer failed'}).`,
  ...(withSummaries && r.report && r.report.written && r.report.summary ? clip(r.report.summary, 900).split('\n').map(line => `  ${line}`) : []),
])

const unsaved = rounds.some(r => r.revise && !(r.revision && r.revision.written))
const next = []
if (unsaved) next.push(`The plan writer did not save its rulings, so the plan is not revised. If Claude Code refused the write, ${ALLOW}. Then run the review again.`)
if (unreviewed) next.push(`Tell the user that the critical or major changes of round ${unreviewed} were not re-reviewed: this run's round limit is ${maxRounds}.`)
if (stopped) next.push(`The run stopped early: ${stopped}.`)
if (open.length) next.push(`Ask the user the open questions in §8 (${open.join(', ')}), with their options and recommendations, and send the answers to \`devflow:plan-writer\` in Answers mode.`)
else if (REVISABLE.includes(status) && !unsaved && !unreviewed && !stopped && rounds.every(r => r.judged)) next.push('No question is open, and no critical or major change is left without a re-review: once the user has read the reports, ask for their approval of the plan.')
next.push('Read the reports for the findings and the rulings, and the plan\'s §9 for where each change was applied.')

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
