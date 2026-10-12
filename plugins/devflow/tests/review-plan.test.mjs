// Control-flow tests for workflows/review-plan.js: the script runs against stub agents,
// so rounds, re-review, verification, rulings and read-only statuses are checked without a model.
// Run: node plugins/devflow/tests/review-plan.test.mjs
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const script = new URL('../workflows/review-plan.js', import.meta.url)
const src = readFileSync(script, 'utf8').replace(/^export const meta/m, 'const meta')
assert.ok(!src.includes(String.fromCharCode(13)), 'the Workflow tool rejects scripts with carriage returns')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const body = new AsyncFunction('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', src)

const finding = (id, lens, severity, status = 'violation') => ({
  id, lens, rule: 'r', status, severity, file: 'plan.md §4.1', lines: '', evidence: 'e', problem: 'p', fix: 'f', profileRef: '', occurrences: [],
})

async function run(name, { args, status = 'draft', reviews, verdict = 'confirmed', judge, writerFails = false, noPlan = false }) {
  const calls = []
  const logs = []
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || ''
    calls.push({ label, agentType: opts.agentType, prompt })
    if (label.startsWith('load')) {
      if (noPlan) return { repoRoot: '/r', planPath: '', feature: '', today: '2026-10-12', status: 'unknown', revision: '', profilePath: '', sources: [], designDir: '', stale: [], useCases: [], missing: [], openQuestions: [], note: 'no plans' }
      return { repoRoot: '/r', planPath: '.claude/docs/plans/x.md', feature: 'x', today: '2026-10-12', status, revision: '1', profilePath: '.claude/docs/architecture.md', sources: [], designDir: '', stale: [], useCases: [{ id: 'UC-1', name: 'a', summary: 's' }, { id: 'UC-2', name: 'b', summary: 's' }], missing: [], openQuestions: [], note: '' }
    }
    if (label.startsWith('verify')) return { verdict, status: 'violation', severity: 'major', reason: 'checked' }
    if (label.startsWith('judge')) {
      const round = Number(label.split(' ').pop())
      const kept = JSON.parse(prompt.slice(prompt.indexOf('Findings (JSON):') + 16))
      return judge(round, kept)
    }
    if (label.startsWith('revise')) {
      if (writerFails) return null
      const round = Number(label.split(' ').pop())
      return { path: 'x', status: 'reviewed', revision: String(round + 1), applied: [{ findings: ['L-1'], sections: ['§4.1'], summary: 'moved' }], openQuestions: ['Q-1'], notes: '' }
    }
    if (label === 'report') return { path: '/r/.claude/docs/reviews/x-plan-review-2026-10-12.md', summary: 'summary' }
    // A reviewer: label is "<key>" or "<key> (round n)".
    const round = /\(round (\d+)\)/.test(label) ? Number(label.match(/\(round (\d+)\)/)[1]) : 1
    const key = label.replace(/ \(round \d+\)$/, '')
    return { findings: (reviews[round] && reviews[round][key]) || [], summary: `${key} ok` }
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
  return { name, result, calls, logs, count: p => calls.filter(c => c.label.startsWith(p)).length }
}

// 1. A major finding is accepted in round 1, so round 2 re-reviews; round 2 is clean, so the loop stops.
{
  const r = await run('rereview', {
    args: 'x',
    reviews: { 1: { lowy: [finding('L-1', 'lowy', 'major')], plan: [finding('P-1', 'plan', 'minor')] } },
    judge: (round, kept) => ({ rulings: kept.map(f => ({ findings: [f.id], ruling: f.severity === 'major' ? 'accept' : 'reject', severity: f.severity, reason: 'x', sections: ['§4.1'], change: 'c', question: '' })), conflicts: [], notes: '', summary: 's' }),
  })
  assert.equal(r.count('load'), 2, 'two loads')
  assert.equal(r.count('judge'), 1, 'judge skipped when round 2 has no findings')
  assert.equal(r.count('revise'), 2, 'every round is logged by the writer')
  assert.equal(r.count('verify'), 1, 'only the major violation is verified')
  assert.equal(r.calls.filter(c => c.label === 'chains UC-1').length, 1)
  assert.equal(r.calls.filter(c => c.label === 'chains UC-1 (round 2)').length, 1)
  const round2 = r.calls.find(c => c.label === 'lowy (round 2)')
  assert.match(round2.prompt, /This is review round 2/)
  const lastRevise = r.calls.filter(c => c.label.startsWith('revise')).pop()
  assert.match(lastRevise.prompt, /No findings survived verification/)
  assert.equal(r.calls.find(c => c.label === 'plan').agentType, 'devflow:plan-reviewer')
  assert.equal(r.calls.find(c => c.label === 'judge round 1').agentType, 'devflow:plan-judge')
  assert.equal(r.calls.find(c => c.label === 'revise round 1').agentType, 'devflow:plan-writer')
  assert.match(r.result, /Plan: \.claude\/docs\/plans\/x\.md \(reviewed, revision 3\)\. Open questions: Q-1\./)
  console.log('ok', r.name)
}

// 2. The round limit stops a re-review and says so.
{
  const r = await run('limit', {
    args: 'x --rounds=1',
    reviews: { 1: { dmf: [finding('D-1', 'dmf', 'critical')] } },
    judge: (round, kept) => ({ rulings: [{ findings: ['D-1'], ruling: 'accept', severity: 'critical', reason: 'x', sections: ['§5.1'], change: 'c', question: '' }], conflicts: [], notes: '', summary: 's' }),
  })
  assert.equal(r.count('load'), 1)
  assert.ok(r.logs.some(l => /not re-reviewed/.test(l)), 'logs the unreviewed changes')
  assert.match(r.calls.find(c => c.label === 'report').prompt, /not re-reviewed \(say so\)/)
  console.log('ok', r.name)
}

// 3. A plan being implemented is reviewed but never revised.
{
  const r = await run('in-progress', {
    args: 'x',
    status: 'in-progress',
    reviews: { 1: { lowy: [finding('L-1', 'lowy', 'major')] } },
    judge: (round, kept) => ({ rulings: [{ findings: ['L-1'], ruling: 'accept', severity: 'major', reason: 'x', sections: [], change: 'c', question: '' }], conflicts: [], notes: '', summary: 's' }),
  })
  assert.equal(r.count('revise'), 0)
  assert.equal(r.count('load'), 1)
  assert.match(r.calls.find(c => c.label === 'report').prompt, /was not revised/)
  console.log('ok', r.name)
}

// 4. A finding the judge leaves out is reported, refuted findings never reach the judge, and duplicate ids are made unique.
{
  const r = await run('unruled', {
    args: 'x',
    reviews: { 1: { lowy: [finding('L-1', 'lowy', 'minor'), finding('L-1', 'lowy', 'nit')], dmf: [finding('D-1', 'dmf', 'major')] } },
    verdict: 'refuted',
    judge: (round, kept) => {
      assert.deepEqual(kept.map(f => f.id).sort(), ['L-1', 'L-1b'], 'refuted D-1 is not judged; the duplicate id is renamed')
      return { rulings: [{ findings: ['L-1'], ruling: 'reject', severity: 'minor', reason: 'x', sections: [], change: '', question: '' }], conflicts: [], notes: '', summary: 's' }
    },
  })
  assert.ok(r.logs.some(l => /no ruling covers L-1b/.test(l)))
  assert.equal(r.count('load'), 1, 'no re-review without an accepted serious change')
  console.log('ok', r.name)
}

// 5. Lens selection, no plan, and bad options.
{
  const r = await run('lenses', { args: { plan: 'x', lenses: 'dmf,plan' }, reviews: {}, judge: () => assert.fail('no findings, no judge') })
  assert.deepEqual(r.calls.filter(c => !/^(load|revise|report)/.test(c.label)).map(c => c.label).sort(), ['dmf', 'plan'])
  const none = await run('no plan', { args: '', noPlan: true, reviews: {}, judge: () => {} })
  assert.match(none.result, /no plans\. Write the plan first/)
  await assert.rejects(run('bad lens', { args: 'x --lenses=fp', reviews: {}, judge: () => {} }), /Unknown lens fp/)
  await assert.rejects(run('bad flag', { args: 'x --fast', reviews: {}, judge: () => {} }), /Unknown option --fast/)
  console.log('ok', r.name, '/ no plan / bad options')
}

// 6. A failed writer stops the loop instead of re-reviewing an unrevised plan.
{
  const r = await run('writer fails', {
    args: 'x',
    writerFails: true,
    reviews: { 1: { lowy: [finding('L-1', 'lowy', 'major')] } },
    judge: () => ({ rulings: [{ findings: ['L-1'], ruling: 'accept', severity: 'major', reason: 'x', sections: [], change: 'c', question: '' }], conflicts: [], notes: '', summary: 's' }),
  })
  assert.equal(r.count('load'), 1)
  assert.ok(r.logs.some(l => /plan writer failed/.test(l)))
  assert.match(r.result, /\(draft, revision 1\)/)
  console.log('ok', r.name)
}

console.log('review-plan: all control-flow tests passed')
