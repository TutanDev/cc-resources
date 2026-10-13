// Control-flow tests for workflows/review-plan.js: the script runs against stub agents, so the access check, verification,
// rulings, the writer's prompt, the rounds, read-only statuses, failures and the returned result are checked without a model.
// Run: node plugins/devflow/tests/review-plan.test.mjs
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const script = new URL('../workflows/review-plan.js', import.meta.url)
const src = readFileSync(script, 'utf8').replace(/^export const meta/m, 'const meta')
assert.ok(!src.includes(String.fromCharCode(13)), 'the Workflow tool rejects scripts with carriage returns')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const body = new AsyncFunction('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', src)
const EM_DASH = String.fromCharCode(0x2014)

const finding = (id, lens, severity, status = 'violation') => ({
  id, lens, rule: 'r', status, severity, file: 'plan.md §4.1', lines: '', evidence: 'e', problem: 'p', fix: 'f', profileRef: '', occurrences: [],
})
const ruling = (ids, kind, severity) => ({ findings: ids, ruling: kind, severity, reason: 'x', sections: kind === 'accept' ? ['§4.1'] : [], change: kind === 'accept' ? 'c' : '', question: kind === 'ask' ? 'q?' : '' })
const isSerious = f => f.severity === 'critical' || f.severity === 'major'
const acceptSerious = kept => ({ rulings: kept.map(f => ruling([f.id], isSerious(f) ? 'accept' : 'reject', f.severity)), conflicts: [], notes: '', summary: 's' })
// The rulings as the writer's prompt renders them: heading and fenced text.
const rulingBlocks = prompt => [...prompt.matchAll(/^#### \d+\. (.+)\n\n(~{4,})\n([\s\S]*?)\n\2$/gm)].map(m => ({ heading: m[1], text: m[3] }))

async function run(name, {
  args, status = 'draft', lastRound = 0, openQuestions = [], reviews = {}, verdict = 'confirmed', judge = () => assert.fail('no judge expected'),
  judgeFails = false, reportFails = false, writerFails = false, writerRefuses = false, writerSkipsLog = false,
  checkRefused = false, checkFails = false, readRefused = false, readFails = false, noPlan = false, legacyDocs = false, planPath = 'cc-docs/plans/x.md', summary = round => `summary of round ${round}`,
}) {
  const calls = []
  const logs = []
  // The plan as the stub agents see it: the writer moves it forward, and the next load reads it back.
  const plan = { status, revision: 1, lastRound, openQuestions: [...openQuestions] }
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || ''
    calls.push({ label, agentType: opts.agentType, prompt })
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
    if (label.startsWith('verify')) return { verdict, status: 'violation', severity: 'major', reason: 'checked' }
    const round = Number((label.match(/round (\d+)/) || [])[1] || 1)
    if (label.startsWith('judge')) {
      if (judgeFails) return null
      const kept = JSON.parse(prompt.slice(prompt.indexOf('Findings (JSON):') + 16))
      return judge(kept, round)
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
      return { written: true, status: 'reviewed', revision: String(plan.revision), changes: `changes of round ${round}`, questions, note: '' }
    }
    if (label.startsWith('report round')) return reportFails ? null : { written: true, error: '', summary: summary(round) }
    // A reviewer: label is "<key>" or "<key> (round n)". A list of findings is for the first round of the run only.
    const key = label.replace(/ \(round \d+\)$/, '')
    const found = typeof reviews[key] === 'function' ? reviews[key](round) : round === lastRound + 1 ? reviews[key] : []
    return { findings: found || [], summary: `${key} ok` }
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
  const r = { name, result, calls, logs, plan, count: p => calls.filter(c => c.label.startsWith(p)).length, call: label => calls.find(c => c.label === label) }
  assert.equal(typeof result, 'string')
  assert.ok(!/\n\n\n/.test(result), 'no run of blank lines in the result')
  assert.ok(result.length <= 6000, `the caller sees only the start of a long result (${result.length} chars)`)
  assert.ok(!result.includes(EM_DASH), 'no em dash in the result')
  return r
}

// 1. Round 1 accepts a major finding, the writer applies it, and round 2 reviews the changes; a clean round 2 ends the run.
{
  const r = await run('two rounds', {
    args: 'x',
    reviews: { lowy: [finding('L-1', 'lowy', 'major')], plan: [finding('P-1', 'plan', 'minor')] },
    judge: acceptSerious,
  })
  assert.deepEqual(r.calls.slice(0, 3).map(c => c.label), ['load', 'read check', 'write check'], 'the access check runs before any reviewer')
  assert.equal(r.calls[1].agentType, 'devflow:plan-reviewer', 'a plugin agent checks the read, since it knows its plugin folder')
  assert.match(r.call('read check').prompt, /^This is an access check, not a review: do only this\.\nRead the first reference file your instructions list/)
  const check = r.call('write check').prompt
  assert.match(check, /Create the file `\/r\/cc-docs\/reviews\/x-plan-review-2026-10-12-round-1\.md` with one Write call/)
  assert.match(check, /<<<TEXT\n# Plan Review: x\n\n## Round 1, 2026-10-12\n\nThis review round has not finished\.\n/)
  assert.equal(r.count('verify'), 1, 'only the major violation is verified')
  assert.equal(r.calls.filter(c => /^chains UC-\d$/.test(c.label)).length, 2, 'one call-chain reviewer per use case')
  assert.equal(r.call('plan').agentType, 'devflow:plan-reviewer')
  assert.equal(r.call('judge round 1').agentType, 'devflow:plan-judge')

  const writer = r.call('revise round 1')
  assert.equal(writer.agentType, 'devflow:plan-writer')
  assert.ok(writer.prompt.startsWith('Mode: Revise. Plan: `cc-docs/plans/x.md`. Round: 1. Date: 2026-10-12. Report file name: `x-plan-review-2026-10-12-round-1.md`.\n'), writer.prompt)
  assert.deepEqual(rulingBlocks(writer.prompt), [
    { heading: 'L-1 (lowy; major): accept', text: 'Sections: §4.1\nReason: x\nChange:\nc' },
    { heading: 'P-1 (plan; minor): reject', text: 'Reason: x' },
  ])
  const report = r.call('report round 1').prompt
  assert.match(report, /^Write the report of review round 1 of the feature plan `cc-docs\/plans\/x\.md` to `\/r\/cc-docs\/reviews\/x-plan-review-2026-10-12-round-1\.md`, with one Write call/)
  assert.match(report, /Title `# Plan Review: x`/)
  assert.match(report, /round 2 reviews them once the writer has applied them/)
  assert.match(report, /the change, in one or two sentences/)

  assert.ok(r.call('load round 2'), 'round 2 reloads the revised plan')
  assert.equal(r.count('write check'), 1, 'the write check runs once per run')
  const lowy2 = r.call('lowy (round 2)').prompt
  assert.match(lowy2, /This is review round 2/)
  assert.match(lowy2, /Changes made since round 1: changes of round 1/)
  assert.equal(r.count('judge round 2'), 0, 'a round without findings has no judge')
  assert.match(r.call('revise round 2').prompt, /The judge's rulings, in order:\n\nNo findings survived verification\.$/, 'the writer still logs a clean round')
  assert.equal(r.count('load round 3'), 0, 'a round without serious changes ends the run')

  assert.match(r.result, /^review-plan: `cc-docs\/plans\/x\.md`, rounds 1 to 2 \(at most 2 in this run\), 2026-10-12\. The plan is reviewed at revision 3\.\n/)
  assert.match(r.result, /\nRound 1: 2 findings kept, 0 refuted; rulings: 1 accepted \(1 critical or major\), 1 rejected, 0 sent to the user\.\n- Report: `cc-docs\/reviews\/x-plan-review-2026-10-12-round-1\.md`\n- Plan: revised to revision 2\.\n {2}summary of round 1\n/)
  assert.match(r.result, /\nRound 2: 0 findings kept, 0 refuted; rulings: 0 accepted \(0 critical or major\), 0 rejected, 0 sent to the user\.\n- Report: `cc-docs\/reviews\/x-plan-review-2026-10-12-round-2\.md`\n- Plan: revised to revision 3\.\n/)
  assert.match(r.result, /ask for their approval of the plan/)
  assert.doesNotMatch(r.result, /REPORT|Write call|foreground/, 'the caller saves nothing and runs no agent')
  console.log('ok', r.name)
}

// 2. Serious changes in every round stop at the round limit, which the report and the result both state.
{
  const r = await run('round limit', {
    args: { plan: 'x', thorough: true },
    reviews: { dmf: () => [finding('D-1', 'dmf', 'critical')] },
    judge: (kept, round) => {
      assert.deepEqual(kept.map(f => f.id), [round > 1 ? `R${round}-D-1` : 'D-1'], 'later rounds prefix their ids')
      return { rulings: [ruling(kept.map(f => f.id), 'accept', 'critical')], conflicts: [], notes: '', summary: 's' }
    },
  })
  assert.equal(r.count('verify'), 6, 'thorough verification uses three skeptics, in each round')
  assert.equal(r.count('load round 3'), 0)
  assert.match(r.call('report round 1').prompt, /round 2 reviews them once the writer has applied them/)
  assert.match(r.call('report round 2').prompt, /will not be re-reviewed: this run's round limit is 2/)
  assert.match(r.result, /the critical or major changes of round 2 were not re-reviewed: this run's round limit is 2\./)
  assert.doesNotMatch(r.result, /approval/)
  const one = await run('one round', { args: 'x --rounds=1', reviews: { dmf: [finding('D-1', 'dmf', 'major')] }, judge: acceptSerious })
  assert.equal(one.count('load round'), 0)
  assert.match(one.result, /round 1 \(at most 1 in this run\)/)
  assert.match(one.result, /changes of round 1 were not re-reviewed: this run's round limit is 1\./)
  console.log('ok', r.name, '/', one.name)
}

// 3. A later run continues the plan's round numbers from §9, and reviews what changed since, such as the user's answers.
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
  assert.match(r.call('lowy (round 3)').prompt, /Changes made since round 2: Q-1 answered: codes are case-insensitive/)
  assert.ok(r.call('revise round 3').prompt.includes('Round: 3.'))
  assert.match(r.result, /round 3 \(at most 2 in this run\)/)
  assert.match(r.result, /- Plan: revised to revision 2, with Q-3 added to §8\./)
  assert.match(r.result, /Ask the user the open questions in §8 \(Q-2, Q-3\)/)
  assert.doesNotMatch(r.result, /approval/)
  console.log('ok', r.name)
}

// 4. A plan being implemented is reviewed, but not revised: its report holds the rulings in full, as recommendations.
{
  const r = await run('in-progress', {
    args: 'x',
    status: 'in-progress',
    reviews: { lowy: [finding('L-1', 'lowy', 'major')] },
    judge: acceptSerious,
  })
  assert.equal(r.count('revise'), 0)
  assert.equal(r.count('load round'), 0, 'nothing changes, so there is no second round')
  const report = r.call('report round 1').prompt
  assert.match(report, /every ruling is a recommendation, and this report is its only record/)
  assert.match(report, /the change, in full, as the judge wrote it/)
  assert.match(r.result, /- Plan: not revised \(it is in-progress, so every ruling is a recommendation\)\./)
  assert.doesNotMatch(r.result, /approval|Answers mode/)
  console.log('ok', r.name)
}

// 5. A finding the judge leaves out is reported, refuted findings never reach the judge, and duplicate ids are made unique.
{
  const r = await run('unruled', {
    args: 'x',
    reviews: { lowy: [finding('L-1', 'lowy', 'minor'), finding('L-1', 'lowy', 'nit')], dmf: [finding('D-1', 'dmf', 'major')] },
    verdict: 'refuted',
    judge: kept => {
      assert.deepEqual(kept.map(f => f.id).sort(), ['L-1', 'L-1b'], 'refuted D-1 is not judged; the duplicate id is renamed')
      return { rulings: [ruling(['L-1'], 'reject', 'minor')], conflicts: [], notes: '', summary: 's' }
    },
  })
  assert.ok(r.logs.some(l => /No ruling covers L-1b/.test(l)))
  assert.match(r.result, /Round 1: 2 findings kept, 1 refuted; .* Without a ruling: L-1b\./)
  assert.match(r.call('report round 1').prompt, /Findings no ruling covers: L-1b\./)
  assert.equal(r.count('load round'), 0, 'no next round without an accepted serious change')
  console.log('ok', r.name)
}

// 6. The writer gets each ruling verbatim, even with fences of its own, with every lens it covers.
{
  const change = 'Replace the sketch:\n\n```csharp\npublic sealed record A;\n```\n\n~~~~\nnested\n~~~~\nThen renumber. Two sentences on a line stay as written.'
  const r = await run('verbatim', {
    args: 'x',
    reviews: { 'chains UC-1': [finding('C-1', 'chains', 'minor')], plan: [finding('P-3', 'plan', 'minor')], dmf: [finding('D-4', 'dmf', 'nit')] },
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
  assert.equal(asked.text, 'Reason: x\nQuestion:\nRename it?\n- (a) yes\n- (b) no\nRecommendation: (a).')
  console.log('ok', r.name)
}

// 7. A refused read or write in the access check stops the run before any reviewer, and says how to allow them.
{
  const allow = /use auto mode, or add the rules `Read\(~\/\.claude\/plugins\/\*\*\)` \(the agents read their plugins' reference files\) and `Edit\(\/\/\*\*\/cc-docs\/\*\*\)` \(they write the plan and the reports\) to `permissions\.allow` in `~\/\.claude\/settings\.json`\.\nThen run the review again\.$/
  const write = await run('write refused', { args: 'x', checkRefused: true, reviews: { lowy: [finding('L-1', 'lowy', 'major')] } })
  assert.deepEqual(write.calls.map(c => c.label), ['load', 'read check', 'write check'])
  assert.match(write.result, /^review-plan stopped before reviewing: Claude Code refused the write to `\/r\/cc-docs\/reviews\/x-plan-review-2026-10-12-round-1\.md` \(Claude requested permissions to write to [^)]+ granted it yet\)\.\n/)
  assert.match(write.result, allow)
  const read = await run('read refused', { args: 'x', readRefused: true })
  assert.deepEqual(read.calls.map(c => c.label), ['load', 'read check', 'write check'])
  assert.match(read.result, /^review-plan stopped before reviewing: Claude Code refused a read of `C:\/Users\/u\/\.claude\/plugins\/cache\/cc-resources\/devflow\/0\.1\.0\/references\/feature-plan\.md` \(Claude requested permissions to read from [^)]+\)\.\n/)
  assert.match(read.result, allow)
  const both = await run('read and write refused', { args: 'x', readRefused: true, checkRefused: true })
  assert.match(both.result, /^review-plan stopped before reviewing: Claude Code refused a read of `[^`]+` \([^)]+\), and the write to `[^`]+` \([^)]+\)\.\n/)
  for (const fails of [{ checkFails: true }, { readFails: true }]) {
    const crashed = await run('access check fails', { args: 'x', ...fails })
    assert.deepEqual(crashed.calls.map(c => c.label), ['load', 'read check', 'write check'])
    assert.equal(crashed.result, 'review-plan: the access check failed, so nothing was reviewed. Run the review again.')
  }
  console.log('ok', write.name, '/', read.name, '/', both.name, '/ access check fails')
}

// 8. Failures after the reviews: the judge, the writer, the report agent, and a writer that does not log its round.
{
  const noJudge = await run('judge fails', { args: 'x', judgeFails: true, reviews: { lowy: [finding('L-1', 'lowy', 'major')] } })
  assert.equal(noJudge.count('revise'), 0)
  assert.match(noJudge.call('report round 1').prompt, /The judge failed: list the kept findings without rulings/)
  assert.match(noJudge.result, /Round 1: 1 findings kept, 0 refuted; the judge failed, so nothing was ruled\.\n/)
  assert.match(noJudge.result, /- Plan: not revised \(no rulings\)\./)
  assert.doesNotMatch(noJudge.result, /approval/)

  const refused = await run('writer refused', { args: 'x', writerRefuses: true, reviews: { lowy: [finding('L-1', 'lowy', 'major')] }, judge: acceptSerious })
  assert.equal(refused.count('load round'), 0, 'no next round on a plan that was not revised')
  assert.match(refused.result, /- Plan: not saved \(Permission to write cc-docs\/plans\/x\.md was denied\)\./)
  assert.match(refused.result, /The plan writer did not save its rulings, so the plan is not revised\. If Claude Code refused the write, allow the workflow's reads and writes in advance: use auto mode, or add the rules `Read\(~\/\.claude\/plugins\/\*\*\)`/)
  assert.match(refused.result, /The plan is draft at revision 1\./)
  const crashed = await run('writer fails', { args: 'x', writerFails: true, reviews: { lowy: [finding('L-1', 'lowy', 'major')] }, judge: acceptSerious })
  assert.match(crashed.result, /- Plan: not saved \(the plan writer failed\)\./)

  const noReport = await run('report fails', { args: 'x', reportFails: true, reviews: { lowy: [finding('L-1', 'lowy', 'major')] }, judge: acceptSerious })
  assert.match(noReport.result, /- Report: not written \(the report agent failed; relaunch to retry it from cached results\)\./)
  assert.ok(noReport.call('load round 2'), 'the plan was revised, so the next round still runs')

  const unlogged = await run('writer skips §9', { args: 'x', writerSkipsLog: true, reviews: { lowy: () => [finding('L-1', 'lowy', 'major')] }, judge: acceptSerious })
  assert.equal(unlogged.count('lowy (round'), 0)
  assert.match(unlogged.result, /The run stopped early: §9 of the plan does not record round 1, so round 2 was not run\./)
  console.log('ok', noJudge.name, '/', refused.name, '/', crashed.name, '/', noReport.name, '/', unlogged.name)
}

// 9. The result stays short however many rounds run: the report summaries go first.
{
  const r = await run('long run', {
    args: 'x --rounds=6',
    reviews: { lowy: () => [finding('L-1', 'lowy', 'major')] },
    judge: acceptSerious,
    summary: round => Array.from({ length: 6 }, (_, i) => `Line ${i + 1} of the summary of round ${round}, `.padEnd(150, 'x')).join('\n'),
  })
  assert.equal(r.count('report round'), 6)
  assert.doesNotMatch(r.result, /Line 1 of the summary/)
  assert.match(r.result, /\nRound 6: .*\n- Report: `cc-docs\/reviews\/x-plan-review-2026-10-12-round-6\.md`\n- Plan: revised to revision 7\./)
  console.log('ok', r.name, `(${r.result.length} chars)`)
}

// A summary too long for the result is cut at a word boundary, never inside a word.
{
  const r = await run('long summary', { summary: () => `${'alpha '.repeat(149)}start-up of the services.` })
  assert.match(r.result, /\n {2}(alpha ){148}alpha\.\.\.\n/)
  console.log('ok', r.name)
}

// 10. Lens selection, no plan, documents still under .claude/, and bad options.
{
  const r = await run('lenses', { args: { plan: 'x', lenses: 'dmf,plan' } })
  assert.deepEqual(r.calls.filter(c => !/^(load|read check|write check|revise round 1|report round 1)$/.test(c.label)).map(c => c.label).sort(), ['dmf', 'plan'])
  const none = await run('no plan', { args: '', noPlan: true })
  assert.match(none.result, /no plans\. Write the plan first/)
  const legacy = await run('legacy, no plan', { args: 'x', noPlan: true, legacyDocs: true })
  assert.match(legacy.result, /still in `\.claude\/docs\/`, where workflow agents cannot write\. Move the documents with `git mv \.claude\/docs cc-docs`/)
  const under = await run('legacy plan path', { args: '.claude/docs/plans/x.md', planPath: '.claude/docs/plans/x.md' })
  assert.deepEqual(under.calls.map(c => c.label), ['load'])
  assert.match(under.result, /is under `\.claude\/`, where workflow agents cannot write/)
  const both = await run('legacy folder left', { args: 'x', legacyDocs: true })
  assert.ok(both.logs.some(l => /`\.claude\/docs\/` still exists/.test(l)))
  await assert.rejects(run('bad lens', { args: 'x --lenses=fp' }), /Unknown lens fp/)
  await assert.rejects(run('bad flag', { args: 'x --out=docs' }), /Unknown option --out/)
  console.log('ok', r.name, '/ no plan / legacy / bad options')
}

console.log('review-plan: all control-flow tests passed')
