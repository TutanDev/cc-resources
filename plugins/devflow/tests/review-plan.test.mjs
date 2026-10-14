// Control-flow tests for workflows/review-plan.js: the script runs against stub agents, so the access check, the models,
// verification, rulings, the writer's prompt, the rendered report, the rounds, read-only statuses, failures and the
// returned result are checked without a model.
// Run: node plugins/devflow/tests/review-plan.test.mjs
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const script = new URL('../workflows/review-plan.js', import.meta.url)
const src = readFileSync(script, 'utf8').replace(/^export const meta/m, 'const meta')
assert.ok(!src.includes(String.fromCharCode(13)), 'the Workflow tool rejects scripts with carriage returns')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const body = new AsyncFunction('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', src)
const EM_DASH = String.fromCharCode(0x2014)

// How the house-rules hook (plugins/house-rules/hooks/register.ts) reads Markdown: a line of prose holds one sentence.
// Headings, table rows, HTML and fenced code are not judged. The report must pass it, or the hook refuses its Write.
const SENTENCE_END = /(?<!\.)[.!?]["'”’)\]*_]*\s+(?=["'“‘(\[*_]*\p{Lu})/u
const ABBREVIATION = /\b(?:e\.g|E\.g|i\.e|I\.e|vs|cf|approx|Dr|Mr|Mrs|Ms|St|Fig|Eq|Sec|No|\p{Lu})\./gu
const asProse = line => line
  .replace(/^\s*(?:>\s?)*/, '')
  .replace(/^(?:[-*+]|\d+[.)])\s+/, '')
  .replace(/^([*_]*)\d+[.)]\s+/, '$1')
  .replace(/^([*_]{1,2})[^*_]+:\1\s*/, '')
  .replace(/(`+)[\s\S]*?\1/g, 'Code')
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(ABBREVIATION, abbreviation => abbreviation.slice(0, -1))
const isSentence = piece => piece.split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length >= 2
const crowdedLines = markdown => {
  const crowded = []
  let fence
  for (const line of markdown.split('\n')) {
    const marker = (/^\s*(`{3,}|~{3,})/.exec(line) || [])[1]
    if (fence !== undefined) {
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined
      continue
    }
    if (marker !== undefined) { fence = marker; continue }
    if (!/^\s*(?:#|\||<|\[[^\]]+\]:)/.test(line) && asProse(line).split(SENTENCE_END).filter(isSentence).length >= 2) crowded.push(line)
  }
  return crowded
}

const finding = (id, lens, severity, status = 'violation') => ({
  id, lens, rule: 'r', status, severity, file: 'plan.md §4.1', lines: '', evidence: 'e', problem: 'p', fix: 'f', profileRef: '', occurrences: [],
})
const ruling = (ids, kind, severity, sections = ['§4.1']) => ({ findings: ids, ruling: kind, severity, reason: 'x', sections: kind === 'accept' ? sections : [], change: kind === 'accept' ? 'c' : '', question: kind === 'ask' ? 'q?' : '' })
const isSerious = f => f.severity === 'critical' || f.severity === 'major'
// The judge accepts the serious findings, in the section each lens owns, and rejects the rest.
const SECTION = { lowy: '§4.1', chains: '§4.3', dmf: '§5.1', plan: '§6 Phase 1' }
const acceptSerious = (kept, round, summary = 's') => ({ rulings: kept.map(f => ruling([f.id], isSerious(f) ? 'accept' : 'reject', f.severity, [SECTION[f.lens]])), conflicts: [], notes: '', summary })
// The rulings as the writer's prompt renders them: heading and fenced text.
const rulingBlocks = prompt => [...prompt.matchAll(/^#### \d+\. (.+)\n\n(~{4,})\n([\s\S]*?)\n\2$/gm)].map(m => ({ heading: m[1], text: m[3] }))
const givenFindings = prompt => JSON.parse(prompt.slice(prompt.indexOf('Findings (JSON):') + 16))

async function run(name, {
  args = 'x', status = 'draft', lastRound = 0, openQuestions = [], reviews = {}, summaries = {}, verdict = 'confirmed', judge = () => assert.fail('no judge expected'),
  judgeFails = false, reportFails = false, writerFails = false, writerRefuses = false, writerSkipsLog = false,
  checkRefused = false, checkFails = false, readRefused = false, readFails = false, noPlan = false, legacyDocs = false, planPath = 'cc-docs/plans/x.md',
}) {
  const calls = []
  const logs = []
  // The plan as the stub agents see it: the writer moves it forward, and the next load reads it back.
  const plan = { status, revision: 1, lastRound, openQuestions: [...openQuestions] }
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || ''
    calls.push({ label, agentType: opts.agentType, model: opts.model, effort: opts.effort, prompt })
    if (label === 'load' || label.startsWith('load round')) {
      if (noPlan) return { repoRoot: '/r', planPath: '', feature: '', today: '2026-10-12', status: 'unknown', revision: '', profilePath: '', sources: [], designDir: '', stale: [], useCases: [], missing: [], openQuestions: [], lastRound: 0, legacyDocs, note: 'no plans' }
      return { repoRoot: '/r', planPath, feature: 'x', today: '2026-10-12', status: plan.status, revision: String(plan.revision), profilePath: 'cc-docs/architecture.md', sources: [], designDir: '', stale: [], useCases: [{ id: 'UC-1', name: 'a', summary: 's' }, { id: 'UC-2', name: 'b', summary: 's' }], missing: [], openQuestions: [...plan.openQuestions], lastRound: plan.lastRound, legacyDocs, note: '' }
    }
    if (label === 'read check') {
      if (readFails) return null
      const path = 'C:/Users/u/.claude/plugins/cache/cc-resources/devflow/0.1.0/references/feature-plan.md'
      return readRefused ? { read: false, path, error: `Claude requested permissions to read from ${path}, but you haven't granted it yet.` } : { read: true, path, error: '' }
    }
    if (label === 'write check') {
      if (checkFails) return null
      return checkRefused ? { written: false, error: 'Claude requested permissions to write to /r/cc-docs/reviews/x.md, but you haven\'t granted it yet.' } : { written: true, error: '' }
    }
    // A skeptic answers for each finding it is given; `verdict` may leave one out (null), or rate it anew (an object).
    if (label.startsWith('verify')) {
      return {
        verdicts: givenFindings(prompt).flatMap(f => {
          const answer = typeof verdict === 'function' ? verdict(f) : verdict
          if (!answer) return []
          return [{ id: f.id, status: f.status, severity: f.severity, reason: 'checked', ...(typeof answer === 'string' ? { verdict: answer } : answer) }]
        }),
      }
    }
    const round = Number((label.match(/round (\d+)/) || [])[1] || 1)
    if (label.startsWith('judge')) {
      if (judgeFails) return null
      return judge(givenFindings(prompt), round)
    }
    if (label.startsWith('revise round')) {
      if (writerFails) return null
      if (writerRefuses) return { written: false, status: plan.status, revision: String(plan.revision), changes: '', questions: [], note: 'Permission to write cc-docs/plans/x.md was denied.' }
      const nextQ = Math.max(0, ...plan.openQuestions.map(q => Number(q.slice(2)))) + 1
      const questions = rulingBlocks(prompt).filter(b => / ask$/.test(b.heading)).map((_, i) => `Q-${nextQ + i}`)
      plan.revision += 1
      plan.status = 'reviewed'
      plan.openQuestions.push(...questions)
      if (!writerSkipsLog) plan.lastRound = round
      return { written: true, status: 'reviewed', revision: `${plan.revision}, 2026-10-12`, changes: `changes of round ${round}`, questions, note: '' }
    }
    if (label.startsWith('report round')) return reportFails ? null : { written: true, error: '' }
    // A reviewer: label is "<key>" or "<key> (round n)". A list of findings is for the first round of the run only.
    const key = label.replace(/ \(round \d+\)$/, '')
    const found = typeof reviews[key] === 'function' ? reviews[key](round) : round === lastRound + 1 ? reviews[key] : []
    return { findings: found || [], summary: summaries[key] || `${key} ok` }
  }
  const parallel = async thunks => Promise.all(thunks.map(t => t().catch(() => null)))
  const pipeline = async (items, ...stages) => Promise.all(items.map(async (item, i) => {
    let v = item
    for (const [si, stage] of stages.entries()) {
      try { v = si === 0 ? await stage(item, item, i) : await stage(v, item, i) } catch (e) { console.error(e); return null }
    }
    return v
  }))
  const result = await body(args, agent, parallel, pipeline, () => {}, m => logs.push(m))
  const call = label => calls.find(c => c.label === label)
  // The report a round's agent was given to save, between its markers.
  const report = round => {
    const prompt = call(`report round ${round}`).prompt
    return prompt.slice(prompt.indexOf('<<<REPORT\n') + 10, prompt.lastIndexOf('REPORT>>>'))
  }
  const r = { name, result, calls, logs, plan, call, report, count: p => calls.filter(c => c.label.startsWith(p)).length, labels: p => calls.filter(c => c.label.startsWith(p)).map(c => c.label) }
  assert.equal(typeof result, 'string')
  assert.ok(!/\n\n\n/.test(result), 'no run of blank lines in the result')
  assert.ok(result.length <= 6000, `the caller sees only the start of a long result (${result.length} chars)`)
  assert.ok(!result.includes(EM_DASH), 'no em dash in the result')
  for (const c of calls.filter(c => c.label.startsWith('report round'))) {
    const text = report(Number(c.label.slice(13)))
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), 'the report ends with one newline')
    assert.ok(!/\n\n\n/.test(text), 'no run of blank lines in the report')
    assert.ok(!text.includes(EM_DASH), 'no em dash in the report')
    assert.deepEqual(crowdedLines(text), [], 'one sentence per line of the report')
  }
  return r
}

// 1. Round 1 accepts a major finding, the writer applies it, and round 2 reviews the change with the lenses that own its
// section; a clean round 2 ends the run. Each role runs on its own model and effort.
{
  const r = await run('two rounds', {
    reviews: { lowy: [finding('L-1', 'lowy', 'major')], plan: [finding('P-1', 'plan', 'minor')] },
    judge: acceptSerious,
  })
  assert.deepEqual(r.calls.slice(0, 3).map(c => c.label), ['load', 'read check', 'write check'], 'the access check runs before any reviewer')
  assert.equal(r.calls[1].agentType, 'devflow:plan-reviewer', 'a plugin agent checks the read, since it knows its plugin folder')
  assert.match(r.call('read check').prompt, /^This is an access check, not a review: do only this\.\nRead the first reference file your instructions list/)
  const check = r.call('write check').prompt
  assert.match(check, /Create the file `\/r\/cc-docs\/reviews\/x-plan-review-2026-10-12-round-1\.md` with one Write call/)
  assert.match(check, /<<<TEXT\n# Plan Review: x\n\n## Round 1, 2026-10-12\n\nThis review round has not finished\.\n/)

  // One reviewer per lens: a single call-chain reviewer traces both use cases, and one skeptic takes the lens's serious findings.
  assert.deepEqual(r.labels('chains'), ['chains', 'chains (round 2)'])
  assert.match(r.call('chains').prompt, /^Plan mode: validate the use cases of the feature plan `cc-docs\/plans\/x\.md`:\n- UC-1 "a": s\n- UC-2 "b": s\nFor each, trace the chain/)
  assert.match(r.call('chains').prompt, /ids `C-<use case number>\.<n>` \(`C-2\.1` is the first finding on UC-2\)/)
  assert.deepEqual(r.labels('verify'), ['verify lowy'], 'only the major violation is verified')
  assert.equal(r.call('plan').agentType, 'devflow:plan-reviewer')
  assert.equal(r.call('judge round 1').agentType, 'devflow:plan-judge')

  const role = label => [r.call(label).model, r.call(label).effort]
  for (const label of ['load', 'read check', 'write check', 'report round 1', 'load round 2', 'report round 2']) assert.deepEqual(role(label), ['haiku', 'low'], `${label} is mechanical`)
  for (const label of ['lowy', 'chains', 'dmf', 'plan', 'lowy (round 2)']) assert.deepEqual(role(label), ['sonnet', 'high'], `${label} reviews on Sonnet`)
  assert.deepEqual(role('verify lowy'), ['sonnet', 'medium'])
  assert.deepEqual(role('judge round 1'), [undefined, 'high'], 'the judge runs on the session model')
  assert.deepEqual(role('revise round 1'), [undefined, 'medium'], 'so does the writer')
  assert.deepEqual(role('revise round 2'), ['haiku', 'low'], 'a round without rulings only needs its §9 line')
  assert.match(r.logs[0], /^Models: Sonnet reviews and verifies, the session's model judges and revises, and Haiku loads, checks access and saves the reports\.$/)

  const writer = r.call('revise round 1')
  assert.equal(writer.agentType, 'devflow:plan-writer')
  assert.ok(writer.prompt.startsWith('Mode: Revise. Plan: `cc-docs/plans/x.md`. Round: 1. Date: 2026-10-12. Report file name: `x-plan-review-2026-10-12-round-1.md`.\n'), writer.prompt)
  assert.deepEqual(rulingBlocks(writer.prompt), [
    { heading: 'L-1 (lowy; major): accept', text: 'Sections: §4.1\nReason: x\nChange:\nc' },
    { heading: 'P-1 (plan; minor): reject', text: 'Reason: x' },
  ])

  // The script renders the report; its agent only saves it.
  assert.match(r.call('report round 1').prompt, /^Write the file `\/r\/cc-docs\/reviews\/x-plan-review-2026-10-12-round-1\.md` with exactly the text between the markers, without the markers: it is the report of review round 1/)
  assert.match(r.call('report round 1').prompt, /\nDo not change, shorten or reformat anything, and modify no other file\.\n/)
  const report = r.report(1)
  assert.ok(report.startsWith(`# Plan Review: x

> Source: \`cc-docs/plans/x.md\`, draft at revision 1; profile \`cc-docs/architecture.md\`; 2026-10-12.

## Round 1, 2026-10-12

2 findings from the lowy, chains, dmf, plan lenses: 2 kept, 0 refuted in verification.
The judge accepted 1 (1 critical or major), rejected 1, and sent 0 to the user.
The plan writer applies the rulings and logs them in the plan's §9, which says where each change went.
Round 2 re-reviews the critical and major changes once they are applied.

### Kept Findings

| Lens | Critical | Major | Minor | Nit | Refuted |
|---|---|---|---|---|---|
| Löwy structure | 0 | 1 | 0 | 0 | 0 |
| call chains | 0 | 0 | 0 | 0 | 0 |
| DMF domain modeling | 0 | 0 | 0 | 0 | 0 |
| delivery | 0 | 0 | 1 | 0 | 0 |

### Rulings

| # | Findings | Lens | Severity | Ruling | Sections | Reason |
|---|---|---|---|---|---|---|
| 1 | L-1 | lowy | major | accept | §4.1 | x |
| 2 | P-1 | plan | minor | reject | - | x |

### Accepted Changes

#### 1. 🟠 L-1 (lowy; major)

- **Sections:** §4.1
- **Reason:** x
- **Change:** c

The findings:

- **L-1** (lowy; major): r, at \`plan.md §4.1\`.
  - **Evidence:** e
  - **Problem:** p
  - **Verification:** confirmed: checked

### Rejected

- **P-1** (plan; minor): x

### Reviewer Summaries

#### lowy

lowy ok
`), report)

  // Round 2: §4.1 belongs to the Löwy and call-chain lenses, and the delivery lens checks every change.
  assert.deepEqual(r.labels('').filter(l => / \(round 2\)$/.test(l)).sort(), ['chains (round 2)', 'lowy (round 2)', 'plan (round 2)'])
  assert.equal(r.count('write check'), 1, 'the write check runs once per run')
  const lowy2 = r.call('lowy (round 2)').prompt
  assert.match(lowy2, /This is review round 2/)
  assert.match(lowy2, /Changes made since round 1: changes of round 1\nThis round exists to check the critical and major ones: L-1\.\nReview the revised plan, but report only problems in these changes/)
  assert.equal(r.count('judge round 2'), 0, 'a round without findings has no judge')
  assert.match(r.call('revise round 2').prompt, /The judge's rulings, in order:\n\nNo findings survived verification\.$/, 'the writer still logs a clean round')
  assert.match(r.report(2), /\n0 findings from the lowy, chains, plan lenses: 0 kept, 0 refuted in verification\.\nNo findings survived verification\.\nThis round re-reviewed the critical and major changes of round 1 \(L-1\), with the lenses that own the sections they touched\.\n/)
  assert.equal(r.count('load round 3'), 0, 'a round without serious changes ends the run')

  assert.match(r.result, /^review-plan: `cc-docs\/plans\/x\.md`, rounds 1 to 2 \(at most 2 in this run\), 2026-10-12\. The plan is reviewed at revision 3\.\n/)
  assert.match(r.result, /\nRound 1: 2 findings kept, 0 refuted; rulings: 1 accepted \(1 critical or major\), 1 rejected, 0 sent to the user\.\n- Report: `cc-docs\/reviews\/x-plan-review-2026-10-12-round-1\.md`\n- Plan: revised to revision 2\.\n {2}s\n/)
  assert.match(r.result, /\nRound 2 \(lenses lowy, chains, plan\): 0 findings kept, 0 refuted; none left, so nothing needed a ruling\.\n- Report: `cc-docs\/reviews\/x-plan-review-2026-10-12-round-2\.md`\n- Plan: the round is logged in §9, at revision 3\.\n/)
  assert.match(r.result, /ask for their approval of the plan/)
  assert.doesNotMatch(r.result, /REPORT|Write call|foreground/, 'the caller saves nothing and runs no agent')
  console.log('ok', r.name)
}

// 2. --thorough: the session's model and effort, a reviewer per use case, three skeptics per lens, every lens in round 2.
// Serious changes in every round stop at the round limit, which the report and the result both state.
{
  const r = await run('round limit', {
    args: { plan: 'x', thorough: true },
    reviews: { dmf: () => [finding('D-1', 'dmf', 'critical')] },
    judge: (kept, round) => {
      assert.deepEqual(kept.map(f => f.id), [round > 1 ? `R${round}-D-1` : 'D-1'], 'later rounds prefix their ids')
      return { rulings: [ruling(kept.map(f => f.id), 'accept', 'critical', ['§5.1'])], conflicts: [], notes: '', summary: 's' }
    },
  })
  assert.deepEqual(r.labels('verify'), ['verify dmf #1', 'verify dmf #2', 'verify dmf #3', 'verify dmf #1 (round 2)', 'verify dmf #2 (round 2)', 'verify dmf #3 (round 2)'])
  assert.match(r.call('verify dmf #2').prompt, /\nYou are independent verifier #2; reach your own conclusions\.\n/)
  assert.deepEqual(r.labels('chains'), ['chains UC-1', 'chains UC-2', 'chains UC-1 (round 2)', 'chains UC-2 (round 2)'])
  assert.match(r.call('chains UC-2').prompt, /^Plan mode: validate use case UC-2 of the feature plan `cc-docs\/plans\/x\.md`:\n- UC-2 "b": s\nFor it, trace the chain/)
  assert.ok(r.call('lowy (round 2)'), 'a thorough re-review runs every lens')
  const role = label => [r.call(label).model, r.call(label).effort]
  for (const label of ['lowy', 'chains UC-1', 'verify dmf #1', 'judge round 1']) assert.deepEqual(role(label), [undefined, undefined], `${label} runs on the session's model and effort`)
  assert.deepEqual(role('revise round 1'), [undefined, 'medium'])
  assert.deepEqual(role('load'), ['haiku', 'low'])
  assert.match(r.logs[0], /^Models: the session's model reviews, verifies, judges and revises, and Haiku loads/)
  assert.equal(r.count('load round 3'), 0)
  assert.match(r.report(1), /\nRound 2 re-reviews the critical and major changes once they are applied\.\n/)
  assert.match(r.report(2), /\n### Gaps\n\n- The critical and major changes of this round will not be re-reviewed in this run: its round limit is 2\.\n/)
  assert.match(r.result, /the critical or major changes of round 2 were not re-reviewed: this run's round limit is 2\./)
  assert.doesNotMatch(r.result, /approval/)
  const one = await run('one round', { args: 'x --rounds=1', reviews: { dmf: [finding('D-1', 'dmf', 'major')] }, judge: acceptSerious })
  assert.equal(one.count('load round'), 0)
  assert.match(one.result, /round 1 \(at most 1 in this run\)/)
  assert.match(one.result, /changes of round 1 were not re-reviewed: this run's round limit is 1\./)
  console.log('ok', r.name, '/', one.name)
}

// 3. A re-review round rules only on critical and major findings: its minor findings and nits go to the report.
{
  const minorOnly = await run('re-review, minor only', {
    reviews: { dmf: round => (round === 1 ? [finding('D-1', 'dmf', 'major')] : [finding('D-2', 'dmf', 'nit'), finding('D-3', 'dmf', 'minor')]) },
    judge: (kept, round) => (round === 1 ? acceptSerious(kept) : assert.fail('nothing serious to judge in round 2')),
  })
  assert.match(minorOnly.call('revise round 2').prompt, /The judge's rulings, in order:\n\nNo critical or major finding survived verification\.$/)
  const report = minorOnly.report(2)
  assert.match(report, /\nNo critical or major finding survived verification\.\nThe 2 minor findings and nits below have no ruling: a re-review round rules only on critical and major findings\.\n/)
  assert.match(report, /\n### Findings Without a Ruling\n\n- \*\*R2-D-3\*\* \(dmf; minor\): r, at `plan\.md §4\.1`\.\n {2}- \*\*Evidence:\*\* e\n {2}- \*\*Problem:\*\* p\n {2}- \*\*Proposed fix:\*\* f\n {2}- \*\*Verification:\*\* not verified \(minor\)\n- \*\*R2-D-2\*\* \(dmf; nit\)/, 'most severe first')
  assert.match(minorOnly.result, /\nRound 2 \(lenses dmf, plan\): 2 findings kept, 0 refuted; none critical or major, so nothing needed a ruling\. 2 minor findings and nits are in the report, without a ruling\.\n- Report: [^\n]+\n- Plan: the round is logged in §9, at revision 3\.\n/)
  assert.match(minorOnly.result, /ask for their approval of the plan/)

  const serious = await run('re-review, serious', {
    reviews: { dmf: round => (round === 1 ? [finding('D-1', 'dmf', 'major')] : [finding('D-2', 'dmf', 'minor'), finding('D-3', 'dmf', 'major')]) },
    judge: (kept, round) => {
      if (round === 1) return acceptSerious(kept)
      assert.deepEqual(kept.map(f => f.id), ['R2-D-3'], 'the judge gets only the serious finding')
      return { ...acceptSerious(kept), rulings: kept.map(f => ruling([f.id], 'reject', f.severity)) }
    },
  })
  assert.match(serious.report(2), /\nThe judge accepted 0 \(0 critical or major\), rejected 1, and sent 0 to the user\.\nThe 1 minor findings and nits below have no ruling/)
  assert.deepEqual(rulingBlocks(serious.call('revise round 2').prompt).map(b => b.heading), ['R2-D-3 (dmf; major): reject'])
  console.log('ok', minorOnly.name, '/', serious.name)
}

// 4. The sections a serious change touched choose the lenses of the re-review; without one to go by, every lens runs.
for (const [sections, expected, args = 'x'] of [
  [['§5.1', '§6 Phase 2'], ['dmf', 'plan']],
  [['Phase 3'], ['plan']],
  [['§3'], ['chains', 'dmf', 'plan']],
  [['§4.3 UC-2'], ['lowy', 'chains', 'plan']],
  [['the types'], ['lowy', 'chains', 'dmf', 'plan']],
  [[], ['lowy', 'chains', 'dmf', 'plan']],
  [['§5.1'], ['lowy'], 'x --lenses=lowy'],
]) {
  const r = await run(`sections ${sections.join(', ') || 'none'}`, {
    args,
    reviews: { lowy: [finding('L-1', 'lowy', 'major')] },
    judge: (kept, round) => ({ rulings: kept.map(f => ruling([f.id], round === 1 ? 'accept' : 'reject', f.severity, sections)), conflicts: [], notes: '', summary: 's' }),
  })
  assert.deepEqual(r.labels('').filter(l => / \(round 2\)$/.test(l) && !/^(load|verify|judge|revise|report)/.test(l)).map(l => l.replace(/ \(round 2\)$/, '')), expected, sections.join(', '))
}
console.log('ok', 're-review lenses')

// 5. A later run continues the plan's round numbers from §9, and reviews what changed since, such as the user's answers,
// with the lenses that own the sections the answers changed.
{
  const r = await run('continued', {
    args: { plan: 'x', focus: 'Q-1 answered: codes are case-insensitive (§5).' },
    status: 'reviewed',
    lastRound: 2,
    openQuestions: ['Q-2'],
    reviews: { dmf: [finding('D-1', 'dmf', 'minor')] },
    judge: kept => ({ rulings: [ruling(kept.map(f => f.id), 'ask', 'minor')], conflicts: [], notes: '', summary: 's' }),
  })
  assert.match(r.call('write check').prompt, /x-plan-review-2026-10-12-round-3\.md/)
  assert.deepEqual(r.calls.map(c => c.label).filter(l => /^(lowy|chains|dmf|plan)\b/.test(l)), ['dmf (round 3)', 'plan (round 3)'])
  assert.match(r.call('dmf (round 3)').prompt, /Changes made since round 2: Q-1 answered: codes are case-insensitive \(§5\)\.\nReview the revised plan/)
  assert.ok(r.call('revise round 3').prompt.includes('Round: 3.'))
  assert.match(r.report(1 + 2), /\n### Questions for the User\n\n#### 1\. 🟡 R3-D-1 \(dmf; minor\)\n\n- \*\*Reason:\*\* x\n- \*\*Question:\*\* q\?\n- The plan writer adds it to §8 as an open question\.\n/)
  assert.match(r.result, /round 3 \(at most 2 in this run\)/)
  assert.match(r.result, /\nRound 3 \(lenses dmf, plan\): /)
  assert.match(r.result, /- Plan: revised to revision 2, with Q-3 added to §8\./)
  assert.match(r.result, /Ask the user the open questions in §8 \(Q-2, Q-3\)/)
  assert.doesNotMatch(r.result, /approval/)
  const all = await run('continued, no section', { args: { plan: 'x', focus: 'The user renamed the feature.' }, status: 'reviewed', lastRound: 2 })
  assert.deepEqual(all.calls.map(c => c.label).filter(l => /^(lowy|chains|dmf|plan)\b/.test(l)), ['lowy (round 3)', 'chains (round 3)', 'dmf (round 3)', 'plan (round 3)'])
  console.log('ok', r.name, '/', all.name)
}

// 6. A plan being implemented is reviewed, but not revised: its report holds the rulings in full, as recommendations.
{
  const r = await run('in-progress', {
    status: 'in-progress',
    reviews: { lowy: [finding('L-1', 'lowy', 'major')] },
    judge: acceptSerious,
  })
  assert.equal(r.count('revise'), 0)
  assert.equal(r.count('load round'), 0, 'nothing changes, so there is no second round')
  const report = r.report(1)
  assert.match(report, /\nThe plan is in-progress, so it is not revised: every ruling below is a recommendation, and this report is its only record\.\n/)
  assert.match(report, /\n### Recommended Changes\n\n#### 1\. 🟠 L-1 \(lowy; major\)\n\n- \*\*Sections:\*\* §4\.1\n- \*\*Reason:\*\* x\n- \*\*Change:\*\* c\n/)
  assert.doesNotMatch(report, /Round 2|plan writer/)
  assert.match(r.result, /- Plan: not revised \(it is in-progress, so every ruling is a recommendation\)\./)
  assert.doesNotMatch(r.result, /approval|Answers mode/)
  console.log('ok', r.name)
}

// 7. One skeptic takes a lens's serious violations, and answers for each: refuted, adjusted, or left out (unverified).
{
  const r = await run('verification', {
    reviews: {
      dmf: [finding('D-1', 'dmf', 'major'), finding('D-2', 'dmf', 'critical'), finding('D-3', 'dmf', 'major'), finding('D-4', 'dmf', 'minor'), finding('D-5', 'dmf', 'major', 'debt')],
      plan: [finding('P-1', 'plan', 'critical')],
    },
    verdict: f => ({ 'D-1': 'refuted', 'D-2': { verdict: 'adjusted', severity: 'minor', reason: 'real, but minor' }, 'D-3': null, 'P-1': 'confirmed' }[f.id]),
    judge: kept => {
      assert.deepEqual(kept.map(f => [f.id, f.severity, f.verification]), [
        ['D-2', 'minor', 'adjusted'], ['D-3', 'major', 'unverified'], ['D-4', 'minor', 'not verified (minor)'], ['D-5', 'major', 'not verified (not a violation)'], ['P-1', 'critical', 'confirmed'],
      ])
      return { rulings: kept.map(f => ruling([f.id], 'reject', f.severity)), conflicts: [], notes: '', summary: 's' }
    },
  })
  assert.deepEqual(r.labels('verify'), ['verify dmf', 'verify plan'], 'one skeptic per lens')
  assert.deepEqual(givenFindings(r.call('verify dmf').prompt).map(f => f.id), ['D-1', 'D-2', 'D-3'], 'it gets the serious violations only')
  assert.equal(r.call('verify dmf').agentType, 'dmf:dmf-reviewer', 'the lens\'s own agent verifies')
  assert.match(r.call('verify dmf').prompt, /\nJudge each finding on its own, and return one verdict per finding, with its id\.\nFindings \(JSON\): /)
  assert.match(r.report(1), /\n### Refuted in Verification\n\n- \*\*D-1\*\* \(dmf\): r\. checked\n/)
  assert.match(r.result, /Round 1: 5 findings kept, 1 refuted;/)
  console.log('ok', r.name)
}

// 8. A finding the judge leaves out is reported, and duplicate ids are made unique.
{
  const r = await run('unruled', {
    reviews: { lowy: [finding('L-1', 'lowy', 'minor'), finding('L-1', 'lowy', 'nit')] },
    judge: kept => {
      assert.deepEqual(kept.map(f => f.id).sort(), ['L-1', 'L-1b'], 'the duplicate id is renamed')
      return { rulings: [ruling(['L-1'], 'reject', 'minor')], conflicts: [], notes: '', summary: 's' }
    },
  })
  assert.ok(r.logs.some(l => /No ruling covers L-1b/.test(l)))
  assert.match(r.result, /Round 1: 2 findings kept, 0 refuted; .* Without a ruling: L-1b\./)
  const report = r.report(1)
  assert.match(report, /\n### Findings Without a Ruling\n\n- \*\*L-1b\*\* \(lowy; nit\): r, at `plan\.md §4\.1`\.\n/)
  assert.match(report, /\n### Gaps\n\n- No ruling covers L-1b: they are listed below and not applied to the plan\.\n/)
  assert.equal(r.count('load round'), 0, 'no next round without an accepted serious change')
  console.log('ok', r.name)
}

// 9. The writer gets each ruling verbatim, even with fences of its own, with every lens it covers; the report keeps the
// code as written, and puts each sentence of prose on its own line.
{
  const change = 'Replace the sketch:\n\n```csharp\npublic sealed record A;\n```\n\n~~~~\nnested\n~~~~\nThen renumber. Two sentences on a line stay as written.'
  const r = await run('verbatim', {
    reviews: { chains: [finding('C-1', 'chains', 'minor')], plan: [finding('P-3', 'plan', 'minor')], dmf: [finding('D-4', 'dmf', 'nit')] },
    judge: () => ({
      rulings: [
        { ...ruling(['C-1', 'P-3'], 'accept', 'minor'), change, sections: ['§3', '§6 Phase 4'] },
        { ...ruling(['D-4'], 'ask', 'nit'), question: 'Rename it?\n- (a) yes\n- (b) no\nRecommendation: (a).' },
      ],
      conflicts: [], notes: '', summary: 's',
    }),
  })
  const prompt = r.call('revise round 1').prompt
  const [accepted, asked] = rulingBlocks(prompt)
  assert.equal(accepted.heading, 'C-1, P-3 (chains, plan; minor): accept')
  assert.equal(accepted.text, `Sections: §3, §6 Phase 4\nReason: x\nChange:\n${change}`)
  assert.match(prompt, /\n~~~~~\nSections: §3/, 'the fence is longer than any fence inside the change')
  assert.equal(asked.heading, 'D-4 (dmf; nit): ask')
  assert.match(r.report(1), /\n### Questions for the User\n\n#### 2\. ⚪ D-4 \(dmf; nit\)\n/, 'numbered as in the Rulings table')
  assert.equal(asked.text, 'Reason: x\nQuestion:\nRename it?\n- (a) yes\n- (b) no\nRecommendation: (a).')
  assert.ok(r.report(1).includes(`
- **Change:** Replace the sketch:

  \`\`\`csharp
  public sealed record A;
  \`\`\`

  ~~~~
  nested
  ~~~~
  Then renumber.
  Two sentences on a line stay as written.
`), r.report(1))
  assert.ok(r.report(1).includes(`
- **Question:** Rename it?
  - (a) yes
  - (b) no
  Recommendation: (a).
`), r.report(1))
  console.log('ok', r.name)
}

// 10. What the reviewers and the judge write reaches the report in the house style: no em dash, one sentence per line,
// with abbreviations, inline code, lists, quotes and code fences read the way the house-rules hook reads them.
{
  const tricky = `First sentence. Second one ${EM_DASH} with a dash. See e.g. Foo, or Plan A. Then option two. \`Code\` starts this one! Then "a quote." Ends... and goes on.\n\n\`\`\`csharp\n// Two. Sentences in code stay.\n\`\`\`\n\n- A list item. With two sentences.\n> A quote. Also two.\n| A table. Row two. |`
  const r = await run('report form', {
    reviews: { lowy: [{ ...finding('L-1', 'lowy', 'major'), rule: 'Don\'t #1. Clients', evidence: tricky, problem: tricky }], plan: () => [{ ...finding('P-1', 'plan', 'minor'), problem: tricky }], dmf: [{ ...finding('D-1', 'dmf', 'minor'), evidence: 'public sealed record A { int B; }' }] },
    summaries: { chains: '## Chains\n\n### UC-1 Place an order: verdict valid. One gap ##\n\n| Hop | Kind |' },
    verdict: { verdict: 'confirmed', reason: tricky },
    judge: kept => ({
      rulings: [{ ...ruling(['L-1'], 'accept', 'major'), reason: tricky, change: tricky }, { ...ruling(['P-1'], 'reject', 'minor'), reason: tricky }],
      conflicts: [tricky], notes: tricky, summary: `a ${EM_DASH} b`,
    }),
    args: 'x --rounds=1',
  })
  const report = r.report(1)
  assert.ok(report.includes(`
- **Change:** First sentence.
  Second one - with a dash.
  See e.g. Foo, or Plan A. Then option two.
  \`Code\` starts this one!
  Then "a quote."
  Ends... and goes on.

  \`\`\`csharp
  // Two. Sentences in code stay.
  \`\`\`

  - A list item.
    With two sentences.
  > A quote.
  > Also two.
  | A table. Row two. |
`), report)
  assert.match(report, /\n- \*\*L-1\*\* \(lowy; major\): Don't #1\.\n {2}Clients, at `plan\.md §4\.1`\.\n {2}- \*\*Evidence:\*\*\n {4}~~~~\n {4}First sentence\. Second one - with a dash\./, 'evidence over several lines is quoted in a fence, as written')
  assert.ok(report.includes('\n| 1 | L-1 | lowy | major | accept | §4.1 | First sentence. Second one - with a dash. See e.g. Foo, or Plan A. Then option two. `Code` starts this one! Then "a quote." Ends... and goes on |\n'), 'a table cell holds the first paragraph, on one line')
  assert.ok(report.includes('\n- **D-1** (dmf; minor): r, at `plan.md §4.1`.\n  - **Evidence:**\n    ~~~~\n    public sealed record A { int B; }\n    ~~~~\n'), 'code in evidence is quoted in a fence')
  assert.ok(report.includes('\n#### chains\n\n**Chains**\n\n**UC-1 Place an order: verdict valid.\nOne gap**\n\n| Hop | Kind |\n'), 'headings in a summary become bold lines, so the outline stays the report\'s')
  assert.match(r.result, /\n {2}a - b\n/)
  console.log('ok', r.name)
}

// 11. A refused read or write in the access check stops the run before any reviewer, and says how to allow them.
{
  const allow = /use auto mode, or add the rules `Read\(~\/\.claude\/plugins\/\*\*\)` \(the agents read their plugins' reference files\) and `Edit\(\/\/\*\*\/cc-docs\/\*\*\)` \(they write the plan and the reports\) to `permissions\.allow` in `~\/\.claude\/settings\.json`\.\nThen run the review again\.$/
  const write = await run('write refused', { checkRefused: true, reviews: { lowy: [finding('L-1', 'lowy', 'major')] } })
  assert.deepEqual(write.calls.map(c => c.label), ['load', 'read check', 'write check'])
  assert.match(write.result, /^review-plan stopped before reviewing: Claude Code refused the write to `\/r\/cc-docs\/reviews\/x-plan-review-2026-10-12-round-1\.md` \(Claude requested permissions to write to [^)]+ granted it yet\)\.\n/)
  assert.match(write.result, allow)
  const read = await run('read refused', { readRefused: true })
  assert.deepEqual(read.calls.map(c => c.label), ['load', 'read check', 'write check'])
  assert.match(read.result, /^review-plan stopped before reviewing: Claude Code refused a read of `C:\/Users\/u\/\.claude\/plugins\/cache\/cc-resources\/devflow\/0\.1\.0\/references\/feature-plan\.md` \(Claude requested permissions to read from [^)]+\)\.\n/)
  assert.match(read.result, allow)
  const both = await run('read and write refused', { readRefused: true, checkRefused: true })
  assert.match(both.result, /^review-plan stopped before reviewing: Claude Code refused a read of `[^`]+` \([^)]+\), and the write to `[^`]+` \([^)]+\)\.\n/)
  for (const fails of [{ checkFails: true }, { readFails: true }]) {
    const crashed = await run('access check fails', fails)
    assert.deepEqual(crashed.calls.map(c => c.label), ['load', 'read check', 'write check'])
    assert.equal(crashed.result, 'review-plan: the access check failed, so nothing was reviewed. Run the review again.')
  }
  console.log('ok', write.name, '/', read.name, '/', both.name, '/ access check fails')
}

// 12. Failures after the reviews: the judge, the writer, the report's agent, and a writer that does not log its round.
{
  const noJudge = await run('judge fails', { judgeFails: true, reviews: { lowy: [finding('L-1', 'lowy', 'major')] } })
  assert.equal(noJudge.count('revise'), 0)
  assert.match(noJudge.report(1), /\nThe judge failed, so nothing was ruled\.\n/)
  assert.match(noJudge.report(1), /\n### Findings Without a Ruling\n\n- \*\*L-1\*\* \(lowy; major\)/)
  assert.match(noJudge.report(1), /\n- No ruling covers L-1: the judge failed\.\n/)
  assert.match(noJudge.result, /Round 1: 1 findings kept, 0 refuted; the judge failed, so nothing was ruled\.\n/)
  assert.match(noJudge.result, /- Plan: not revised \(no rulings\)\./)
  assert.doesNotMatch(noJudge.result, /approval/)

  const refused = await run('writer refused', { writerRefuses: true, reviews: { lowy: [finding('L-1', 'lowy', 'major')] }, judge: acceptSerious })
  assert.equal(refused.count('load round'), 0, 'no next round on a plan that was not revised')
  assert.match(refused.result, /- Plan: not saved \(Permission to write cc-docs\/plans\/x\.md was denied\)\./)
  assert.match(refused.result, /The plan writer did not save its rulings, so the plan is not revised\. If Claude Code refused the write, allow the workflow's reads and writes in advance: use auto mode, or add the rules `Read\(~\/\.claude\/plugins\/\*\*\)`/)
  assert.match(refused.result, /The plan is draft at revision 1\./)
  const crashed = await run('writer fails', { writerFails: true, reviews: { lowy: [finding('L-1', 'lowy', 'major')] }, judge: acceptSerious })
  assert.match(crashed.result, /- Plan: not saved \(the plan writer failed\)\./)

  const noReport = await run('report fails', { reportFails: true, reviews: { lowy: [finding('L-1', 'lowy', 'major')] }, judge: acceptSerious })
  assert.match(noReport.result, /- Report: not written \(the report agent failed; relaunch to retry it from cached results\)\./)
  assert.ok(noReport.call('load round 2'), 'the plan was revised, so the next round still runs')

  const unlogged = await run('writer skips §9', { writerSkipsLog: true, reviews: { lowy: () => [finding('L-1', 'lowy', 'major')] }, judge: acceptSerious })
  assert.equal(unlogged.count('lowy (round'), 0)
  assert.match(unlogged.result, /The run stopped early: §9 of the plan does not record round 1, so round 2 was not run\./)
  console.log('ok', noJudge.name, '/', refused.name, '/', crashed.name, '/', noReport.name, '/', unlogged.name)
}

// 13. The result stays short however many rounds run: the judge's summaries go first.
{
  const r = await run('long run', {
    args: 'x --rounds=6',
    reviews: { lowy: () => [finding('L-1', 'lowy', 'major')] },
    judge: (kept, round) => acceptSerious(kept, round, Array.from({ length: 6 }, (_, i) => `Line ${i + 1} of the summary of round ${round}, `.padEnd(150, 'x')).join('\n')),
  })
  assert.equal(r.count('report round'), 6)
  assert.doesNotMatch(r.result, /Line 1 of the summary/)
  assert.match(r.result, /\nRound 6 \(lenses lowy, chains, plan\): .*\n- Report: `cc-docs\/reviews\/x-plan-review-2026-10-12-round-6\.md`\n- Plan: revised to revision 7\./)
  console.log('ok', r.name, `(${r.result.length} chars)`)
}

// A summary too long for the result is cut at a word boundary, never inside a word.
{
  const r = await run('long summary', {
    reviews: { lowy: [finding('L-1', 'lowy', 'minor')] },
    judge: kept => acceptSerious(kept, 1, `${'alpha '.repeat(149)}start-up of the services.`),
  })
  assert.match(r.result, /\n {2}(alpha ){148}alpha\.\.\.\n/)
  console.log('ok', r.name)
}

// 14. Lens selection, no plan, documents still under .claude/, and bad options.
{
  const r = await run('lenses', { args: { plan: 'x', lenses: 'dmf,plan' } })
  assert.deepEqual(r.calls.filter(c => !/^(load|read check|write check|revise round 1|report round 1)$/.test(c.label)).map(c => c.label).sort(), ['dmf', 'plan'])
  assert.match(r.report(1), /\n0 findings from the dmf, plan lenses: /)
  const none = await run('no plan', { args: '', noPlan: true })
  assert.match(none.result, /no plans\. Write the plan first/)
  const legacy = await run('legacy, no plan', { noPlan: true, legacyDocs: true })
  assert.match(legacy.result, /still in `\.claude\/docs\/`, where workflow agents cannot write\. Move the documents with `git mv \.claude\/docs cc-docs`/)
  const under = await run('legacy plan path', { args: '.claude/docs/plans/x.md', planPath: '.claude/docs/plans/x.md' })
  assert.deepEqual(under.calls.map(c => c.label), ['load'])
  assert.match(under.result, /is under `\.claude\/`, where workflow agents cannot write/)
  const both = await run('legacy folder left', { legacyDocs: true })
  assert.ok(both.logs.some(l => /`\.claude\/docs\/` still exists/.test(l)))
  await assert.rejects(run('bad lens', { args: 'x --lenses=fp' }), /Unknown lens fp/)
  await assert.rejects(run('bad flag', { args: 'x --out=docs' }), /Unknown option --out/)
  console.log('ok', r.name, '/ no plan / legacy / bad options')
}

console.log('review-plan: all control-flow tests passed')
