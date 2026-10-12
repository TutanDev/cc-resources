export const meta = {
  name: 'review-plan',
  description: 'Review a feature plan with blind Löwy, call-chain, DMF and delivery reviewers, adversarially verify their findings, have a judge accept, reject or ask the user about each, let the plan writer apply the rulings, re-review the changes once, and write one report',
  whenToUse: 'After a feature plan exists in .claude/docs/plans/ and before the user approves it; pass the feature name or plan path, plus --thorough, --lenses=lowy,chains,dmf,plan, --rounds=N, --date=YYYY-MM-DD or --out=<folder>',
  phases: [
    { title: 'Load', detail: 'plan, status, profile, design sources, use cases' },
    { title: 'Review', detail: 'one blind reviewer per lens, and one per use case for call chains' },
    { title: 'Verify', detail: 'skeptics try to refute critical and major findings' },
    { title: 'Judge', detail: 'accept, reject or ask the user, per finding' },
    { title: 'Revise', detail: 'the plan writer applies the rulings and logs the round' },
    { title: 'Report', detail: 'write .claude/docs/reviews/' },
  ],
}

// Keep this file LF-only: the Workflow tool rejects scripts that contain carriage returns.
// The repository .gitattributes checks it out with LF on every platform.

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
  out: v => v,
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
const maxRounds = Math.max(1, Number(input.rounds) || 2)
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
  required: ['repoRoot', 'planPath', 'feature', 'today', 'status', 'revision', 'profilePath', 'sources', 'designDir', 'stale', 'useCases', 'missing', 'openQuestions', 'note'],
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
const REVISION = {
  type: 'object',
  required: ['path', 'status', 'revision', 'applied', 'openQuestions', 'notes'],
  properties: {
    path: { type: 'string' },
    status: { type: 'string' },
    revision: { type: 'string' },
    applied: {
      type: 'array',
      items: {
        type: 'object',
        required: ['findings', 'sections', 'summary'],
        properties: { findings: STRINGS, sections: STRINGS, summary: { type: 'string' } },
      },
    },
    openQuestions: STRINGS,
    notes: { type: 'string' },
  },
}
const REPORT = {
  type: 'object',
  required: ['path', 'summary'],
  properties: { path: { type: 'string' }, summary: { type: 'string', description: 'Markdown, at most 25 lines' } },
}

// ---------- helpers ----------
const isSerious = f => f.severity === 'critical' || f.severity === 'major'

// Reviewers number their own findings; make every id unique across lenses and rounds.
function uniqueIds(findings) {
  const seen = {}
  return findings.map(f => {
    seen[f.id] = (seen[f.id] || 0) + 1
    return seen[f.id] === 1 ? f : { ...f, id: `${f.id}${String.fromCharCode(96 + seen[f.id])}` }
  })
}

function load(round) {
  return agent(
    `Prepare round ${round} of a feature plan review. Read only; do not modify anything.
The plan contract is \`references/feature-plan.md\` in the devflow plugin; you only need what is below.

1. repoRoot: the repository root (\`git rev-parse --show-toplevel\`, or the current directory).
2. planPath: ${target
      ? `the plan for "${target}": the path itself if it is a file, else \`.claude/docs/plans/${target}.md\`, else the closest match under \`.claude/docs/plans/\`.`
      : 'the only plan under `.claude/docs/plans/`, or the most recently modified one; say which and why in `note`.'}
   Give it relative to the repository root. If there is no plan, return planPath empty and explain in \`note\`.
3. feature: the plan's file name without \`.md\`. today: ${input.date ? input.date : 'today as YYYY-MM-DD (`date +%F`, or `Get-Date -Format yyyy-MM-dd`)'}.
4. status and revision: from the plan's header lines \`> Status:\` and \`> Revision:\` (the revision number only); status \`unknown\` if there is none.
5. profilePath: \`.claude/docs/architecture.md\` under the repository root if it exists, else empty.
6. sources: the files named on the plan's \`> Source:\` line that exist (skip the request text). designDir: the design directory under \`.claude/docs/design/\` among them, else empty.
7. stale: the sources modified after the plan (compare modification times with \`ls -l --time-style=full-iso\` or \`Get-Item\`).
8. useCases: every \`UC-n\` in the plan's §3, with its id, its name, and a one-line summary that names its failures.
9. missing: the sections the plan lacks, of: 1 Goal, 2 Scope, 3 Use Cases, 4 Architecture Impact, 5 Domain Model Impact, 6 Phases, 7 Verification, 8 Risks, Assumptions and Open Questions, 9 Decision Log.
10. openQuestions: the \`Q-n\` ids still open in §8.`,
    { schema: LOAD, label: `load round ${round}`, phase: 'Load' },
  )
}

// ---------- Load ----------
phase('Load')
let ctx = await load(1)
if (!ctx || !ctx.planPath) {
  return `review-plan: ${ctx ? ctx.note : 'the load agent failed'}. Write the plan first with /devflow:plan-feature.`
}
const today = input.date || ctx.today
const plan = ctx.planPath
const feature = ctx.feature
const statusBefore = ctx.status
const revisionBefore = ctx.revision
const canRevise = REVISABLE.includes(ctx.status)
const profileNote = ctx.profilePath
  ? `The project profile is \`${ctx.profilePath}\`: apply its precedence to every finding's status.`
  : 'There is no project profile: every finding is a violation.'
log(`Reviewing ${plan} (${ctx.status}, revision ${ctx.revision}): ${ctx.useCases.length} use cases, lenses ${lenses.join(', ')}, ${votes}-vote verification, up to ${maxRounds} rounds. ${ctx.stale.length ? `Stale inputs: ${ctx.stale.join(', ')}.` : ''}${ctx.missing.length ? ` Missing sections: ${ctx.missing.join(', ')}.` : ''}`)
if (!canRevise) log(`The plan is ${ctx.status}: this review reports and does not revise it.`)
if (ctx.status === 'approved') log('The plan was approved; revising it sets it back to reviewed, and it needs the user\'s approval again.')

// ---------- checks ----------
function buildChecks(c, round, focus) {
  const common = [
    profileNote,
    c.designDir ? `The plan builds on the design directory \`${c.designDir}\`: it must not contradict it without saying so.` : '',
    c.stale.length ? `These inputs changed after the plan was written; check the plan against their current content: ${c.stale.join(', ')}.` : '',
    focus,
    'You are one of several independent reviewers, each with a different lens: stay inside yours, and report what you find without softening it.',
    `Cite the plan as \`file: "${plan} §<section>"\` with \`lines\` empty and the plan text quoted in \`evidence\`; cite code as \`file\` and \`lines\`, read in this session.`,
  ].filter(Boolean).join('\n')
  const list = []
  if (lenses.includes('lowy')) {
    list.push({
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
    c.useCases.forEach((uc, i) => list.push({
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
    list.push({
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
    list.push({
      key: 'plan',
      lens: 'plan',
      prompt: `Review the feature plan \`${plan}\` for delivery, with every check in your instructions.
${common}
Return findings with \`lens: "plan"\` and ids \`P-n\`. Put a one-line verdict in \`summary\`: can a developer agent build it phase by phase, and can a QA agent check every phase?`,
    })
  }
  return list
}

function verifyFinding(f, check) {
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

// ---------- rounds ----------
const rounds = []
let focus = ''
let unreviewed = []
for (let round = 1; round <= maxRounds; round++) {
  if (round > 1) {
    const next = await load(round)
    if (!next || !next.planPath) { log(`Round ${round}: the plan could not be reloaded; stopping.`); break }
    ctx = next
  }
  const checks = buildChecks(ctx, round, focus)
  if (lenses.includes('chains') && ctx.useCases.length === 0) log(`Round ${round}: §3 lists no use cases, so no call chain was checked.`)
  log(`Round ${round}: ${checks.length} reviewers.`)

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
  if (failed.length) log(`Round ${round}: reviews that failed and are missing: ${failed.join(', ')}.`)
  const all = uniqueIds(done.flatMap(r => r.findings))
  const kept = all.filter(f => f.verification !== 'refuted')
  const refuted = all.filter(f => f.verification === 'refuted')
  const summaries = done.filter(r => r.res).map(r => ({ check: r.key, summary: r.res.summary }))
  log(`Round ${round}: ${all.length} findings, ${kept.length} kept, ${refuted.length} refuted.`)

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
    if (!judged) {
      log(`Round ${round}: the judge failed; the plan is not revised, and the report lists the findings without rulings.`)
      rounds.push({ round, summaries, kept, refuted, failed, judged: null, unruled: kept.map(f => f.id), revision: null })
      break
    }
  }
  const ruled = new Set(judged.rulings.flatMap(r => r.findings))
  const unruled = kept.map(f => f.id).filter(id => !ruled.has(id))
  if (unruled.length) log(`Round ${round}: no ruling covers ${unruled.join(', ')}; they go to the report, not into the plan.`)

  // ---------- Revise ----------
  let revision = null
  if (canRevise) {
    phase('Revise')
    revision = await agent(
      `Mode: Revise. Plan: \`${plan}\`. Round: ${round}. Date: ${today}.
Apply the judge's rulings below as your instructions say: make the accepted changes, add the asked questions to §8, and log every ruling in §9${judged.rulings.length ? '' : ' (there are none: log "No findings survived verification.")'}.
Rulings (JSON):
${JSON.stringify(judged.rulings, null, 1)}`,
      { agentType: 'devflow:plan-writer', schema: REVISION, phase: 'Revise', label: `revise round ${round}` },
    )
    if (!revision) log(`Round ${round}: the plan writer failed; the plan was not revised.`)
  }
  rounds.push({ round, summaries, kept, refuted, failed, judged, unruled, revision })

  // Re-review only when this round accepted a critical or major change, and stop when the plan could not be revised.
  const serious = judged.rulings.filter(r => r.ruling === 'accept' && isSerious(r))
  if (!revision || serious.length === 0) break
  if (round === maxRounds) {
    unreviewed = revision.applied
    log(`The changes of round ${round} include critical or major ones and were not re-reviewed: the round limit is ${maxRounds}.`)
    break
  }
  focus = `This is review round ${round + 1}. Round ${round} revised the plan, and its §9 records every ruling so far.
Changes made in round ${round} (JSON): ${JSON.stringify(revision.applied)}
Review the revised plan, but report only problems in these changes or caused by them, and critical problems that earlier rounds missed.
Do not raise again a finding that §9 records as rejected or asked, unless the change made it worse.`
}

// ---------- Report ----------
phase('Report')
// Reports go to .claude/docs/reviews/ unless --out names another folder, absolute or relative to the repository root.
const reportDir = String(input.out || '.claude/docs/reviews').replace(/[\\/]+$/, '')
const resolvePath = file => (/^([A-Za-z]:)?[\\/]/.test(reportDir) ? file : `${ctx.repoRoot}/${file}`)
const reportPath = resolvePath(`${reportDir}/${feature}-plan-review-${today}.md`)
const report = await agent(
  `Write the plan review report to \`${reportPath}\` (create the folder if needed), then return its path and a short summary.
Do not modify any other file.
Read the plan \`${plan}\` as it is now: the report quotes its open questions and its status.

Context: plan \`${plan}\`, ${statusBefore} at revision ${revisionBefore} before this review; date ${today}; profile ${ctx.profilePath || 'none'}; lenses ${lenses.join(', ')}; ${votes}-vote verification of critical and major violations; ${rounds.length} of at most ${maxRounds} rounds run.
${canRevise ? '' : `The plan is ${statusBefore}, so it was not revised: every ruling is a recommendation.`}
Stale inputs: ${ctx.stale.join(', ') || 'none'}. Missing sections: ${ctx.missing.join(', ') || 'none'}. ${ctx.note}
${unreviewed.length ? `Changes from the last round that were not re-reviewed (say so): ${JSON.stringify(unreviewed)}` : ''}

Report structure:
1. Title \`# Plan Review: ${feature}\`, then a \`> Source:\` line with the plan path and its revision now, the profile, and the date.
2. Verdict in one sentence: ready for the user's approval, or what stands in the way.
   It is ready only when §8 holds no open question, no critical or major change went un-re-reviewed, every critical or major finding has a ruling, and no review failed.
3. Open questions the user must answer, copied from §8 with their options and recommendation.
4. Per round: a table of counts per lens and severity, then the rulings (finding ids, lens, severity, ruling, reason, sections changed).
5. Accepted findings in full, most severe first: severity mark (🔴 critical, 🟠 major, 🟡 minor, ⚪ nit), id, rule, file and section, quoted evidence, problem, fix, and the change made.
6. Rejected findings and findings sent to the user: one line each with the reason.
7. Conflicts between lenses and how the judge settled them; the judge's notes.
8. Refuted during verification: one line each (id, rule, reason).
9. Gaps: reviews that failed, findings no ruling covered, changes not re-reviewed.

Rounds (JSON):
${JSON.stringify(rounds.map(r => ({
  round: r.round,
  failedReviews: r.failed,
  reviewerSummaries: r.summaries,
  kept: r.kept,
  refuted: r.refuted.map(f => ({ id: f.id, lens: f.lens, rule: f.rule, file: f.file, reason: f.reason })),
  rulings: r.judged ? r.judged.rulings : null,
  conflicts: r.judged ? r.judged.conflicts : [],
  judgeNotes: r.judged ? r.judged.notes : '',
  unruled: r.unruled,
  revision: r.revision,
})), null, 1)}`,
  { schema: REPORT, label: 'report' },
)

const last = rounds[rounds.length - 1]
const statusNow = last && last.revision ? `${last.revision.status}, revision ${last.revision.revision}` : `${statusBefore}, revision ${revisionBefore}`
const open = last && last.revision ? last.revision.openQuestions : ctx.openQuestions
return report
  ? `${report.summary}\n\nPlan: ${plan} (${statusNow}). Open questions: ${open.length ? open.join(', ') : 'none'}.\nReport: ${report.path}`
  : `review-plan: the report agent failed after ${rounds.length} rounds. Plan: ${plan} (${statusNow}); relaunch to retry the report from cached results.`
