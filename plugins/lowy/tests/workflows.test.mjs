// Control-flow tests for workflows/arch-audit.js and workflows/design-check.js: each script runs against stub agents,
// so the legacy-folder stop, the access check, the report write and the returned result are checked without a model.
// Run: node plugins/lowy/tests/workflows.test.mjs
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const EM_DASH = String.fromCharCode(0x2014)

function load(file) {
  const src = readFileSync(new URL(`../workflows/${file}`, import.meta.url), 'utf8').replace(/^export const meta/m, 'const meta')
  assert.ok(!src.includes(String.fromCharCode(13)), `${file}: the Workflow tool rejects scripts with carriage returns`)
  return new AsyncFunction('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', src)
}
const scripts = { 'arch-audit': load('arch-audit.js'), 'design-check': load('design-check.js') }

const finding = (id, lens, severity, more = {}) => ({
  id, lens, rule: 'r', status: 'violation', severity, file: 'a.cs', lines: '1', evidence: 'e', problem: 'p', fix: 'f', claim: 'structural', proof: 'cited', run: '', profileRef: '', occurrences: [], ...more,
})
const loads = {
  'arch-audit': legacyDocs => ({ repoRoot: '/r', targetName: 'shop', profilePath: 'cc-docs/architecture.md', today: '2026-10-12', revision: 'abc main', subsystems: [{ name: 'shop', path: 'src', why: 'w' }], skipped: [], legacyDocs }),
  'design-check': legacyDocs => ({ repoRoot: '/r', designDir: 'cc-docs/design/shop', topic: 'shop', today: '2026-10-12', profilePath: '', files: ['03-layered-architecture.md'], stale: [], useCases: [{ name: 'checkout', description: 'd', source: '02 §2' }], volatilities: [], legacyDocs, note: '' }),
}

// The first reviewer that runs returns `findings` when given, the others none; a skeptic answers each finding it is
// given with `verdict(finding, vote)`, where vote counts from 1, except the skeptic of `failedVote`, which fails.
async function run(name, workflow, { args = 'shop', legacyDocs = false, checkRefused = false, checkFails = false, readRefused = false, readFails = false, reportRefused = false, reportFails = false, findings, verdict = () => 'confirmed', failedVote = 0 } = {}) {
  let reviewed = false
  const calls = []
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || ''
    calls.push({ label, agentType: opts.agentType, prompt })
    if (label === 'discover' || label === 'load') return loads[workflow](legacyDocs)
    if (label === 'read check') {
      if (readFails) return null
      const path = 'C:/Users/u/.claude/plugins/cache/cc-resources/lowy/0.4.0/references/structure.md'
      return readRefused ? { read: false, path, error: `Claude requested permissions to read from ${path}, but you haven't granted it yet.` } : { read: true, path, error: '' }
    }
    if (label === 'write check') {
      if (checkFails) return null
      return checkRefused ? { written: false, error: 'Permission to write /r/cc-docs/reviews/x.md was denied.' } : { written: true, error: '' }
    }
    if (label === 'report') {
      if (reportFails) return null
      return reportRefused ? { written: false, error: 'Permission denied.', summary: '' } : { written: true, error: '', summary: '2 violations.\n' }
    }
    if (label.startsWith('verify')) {
      const vote = Number((label.match(/\.(\d+)$/) || [])[1] || 1)
      if (vote === failedVote) return null
      const answer = f => ({ id: f.id, verdict: verdict(f, vote), status: f.status, severity: f.severity, reason: `${verdict(f, vote)} by vote ${vote}` })
      return workflow === 'arch-audit'
        ? { verdicts: JSON.parse(prompt.slice(prompt.indexOf('Findings (JSON):') + 16)).map(answer) }
        : answer(JSON.parse(prompt.slice(prompt.indexOf('Finding (JSON):') + 15)))
    }
    // A reviewer or a check.
    const own = findings === undefined ? [finding('L-1', label.split(':')[0], 'major')] : reviewed ? [] : findings
    reviewed = true
    return { findings: own, summary: 's', aligned: [], profileGaps: [], notChecked: [] }
  }
  const parallel = async thunks => Promise.all(thunks.map(t => t().catch(() => null)))
  const pipeline = async (items, ...stages) => Promise.all(items.map(async item => {
    let v = item
    for (const [si, stage] of stages.entries()) {
      try { v = si === 0 ? await stage(item) : await stage(v, item) } catch (e) { console.error(e); return null }
    }
    return v
  }))
  const result = await scripts[workflow](args, agent, parallel, pipeline, () => {}, () => {})
  assert.equal(typeof result, 'string', `${name}: the result is text`)
  assert.ok(!result.includes(EM_DASH), `${name}: no em dash in the result`)
  assert.ok(!/\n\n\n/.test(result), `${name}: no run of blank lines in the result`)
  const reviewers = calls.filter(c => !['discover', 'load', 'read check', 'write check', 'report'].includes(c.label)).length
  return { result, calls, reviewers, call: label => calls.find(c => c.label === label) }
}

for (const workflow of Object.keys(scripts)) {
  const path = `/r/cc-docs/reviews/shop-${workflow}-2026-10-12.md`

  // 1. The access check reads a plugin file and writes the placeholder at the report's path before any reviewer,
  // and the report replaces the placeholder.
  {
    const r = await run('happy path', workflow)
    assert.deepEqual(r.calls.slice(1, 3).map(c => c.label), ['read check', 'write check'], `${workflow}: the access check runs right after the load`)
    assert.equal(r.calls[1].agentType, 'lowy:lowy-reviewer', `${workflow}: a plugin agent checks the read, since it knows its plugin folder`)
    assert.ok(r.call('write check').prompt.includes(`\`${path}\``), `${workflow}: the write check targets the report's path`)
    assert.ok(r.reviewers > 0, `${workflow}: the reviewers ran`)
    assert.ok(r.call('report').prompt.includes(`\`${path}\``), `${workflow}: the report goes to the same path`)
    assert.ok(r.call('report').prompt.includes('replaces the placeholder'), `${workflow}: the report replaces the placeholder`)
    assert.equal(r.result, `2 violations.\n\nReport: \`cc-docs/reviews/shop-${workflow}-2026-10-12.md\``)
  }

  // 2. A refused read or write stops the run before any reviewer, and says how to allow them.
  {
    const allow = "use auto mode, or add the rules `Read(~/.claude/plugins/**)` (the agents read their plugins' reference files) and `Edit(//**/cc-docs/**)`"
    const write = await run('write refused', workflow, { checkRefused: true })
    assert.equal(write.reviewers, 0, `${workflow}: no reviewer runs after a refused write`)
    assert.ok(!write.call('report'), `${workflow}: no report agent after a refused write`)
    assert.ok(write.result.startsWith(`${workflow} stopped before`) && write.result.includes(`the write to \`${path}\` (Permission to write`), `${workflow}: the refusal names the path and the reason`)
    assert.ok(write.result.includes(allow), `${workflow}: the ways to allow the access`)
    const read = await run('read refused', workflow, { readRefused: true })
    assert.equal(read.reviewers, 0, `${workflow}: no reviewer runs after a refused read`)
    assert.ok(read.result.includes('refused a read of `C:/Users/u/.claude/plugins/cache/cc-resources/lowy/0.4.0/references/structure.md` (Claude requested permissions'))
    assert.ok(read.result.includes(allow))
    const both = await run('both refused', workflow, { readRefused: true, checkRefused: true })
    assert.match(both.result, /refused a read of `[^`]+` \([^)]+\), and the write to `[^`]+` \([^)]+\)\.\n/)
  }

  // 3. A failed access check stops the run too.
  for (const fails of [{ checkFails: true }, { readFails: true }]) {
    const r = await run('access check fails', workflow, fails)
    assert.equal(r.reviewers, 0)
    assert.match(r.result, /the access check failed, so nothing was/)
  }

  // 4. Documents still under .claude/docs/ stop the run before the write check, with the move command.
  {
    const r = await run('legacy docs', workflow, { legacyDocs: true })
    assert.equal(r.calls.length, 1, `${workflow}: only the load ran`)
    assert.ok(r.result.includes('`git mv .claude/docs cc-docs`'))
  }

  // 5. A refused or failed report says so, with the counts.
  {
    const refused = await run('report refused', workflow, { reportRefused: true })
    assert.match(refused.result, /report was not written to `.+` \(Permission denied\)\. \d+ findings (were )?kept/)
    const failed = await run('report fails', workflow, { reportFails: true })
    assert.match(failed.result, /report agent failed\. \d+ findings (were )?kept/)
  }

  // 6. --out puts the report elsewhere, absolute or relative to the repository root.
  {
    const relative = await run('out relative', workflow, { args: 'shop --out=docs/audits/' })
    assert.ok(relative.call('write check').prompt.includes(`\`/r/docs/audits/shop-${workflow}-2026-10-12.md\``))
    const absolute = await run('out absolute', workflow, { args: 'shop --out=D:/reports' })
    assert.ok(absolute.call('write check').prompt.includes(`\`D:/reports/shop-${workflow}-2026-10-12.md\``))
  }

  // 7. Proof: a runtime claim no run has proven is unproven, whatever the skeptics say, and so is a finding a skeptic
  // answers unproven; unproven findings go to their own part of the report, out of the kept findings and the counts.
  {
    const findings = [
      finding('L-1', 'lowy', 'major'),
      finding('L-2', 'lowy', 'major', { claim: 'runtime', proof: 'traced', run: 'dotnet test --filter Save' }),
      finding('L-3', 'lowy', 'critical', { claim: 'runtime', proof: 'ran', run: 'dotnet test --filter Load: Expected 2, got 3' }),
      finding('L-4', 'lowy', 'major'),
    ]
    const verdict = f => (f.id.endsWith('L-4') ? 'unproven' : 'confirmed')
    const r = await run('proof', workflow, { findings, verdict })
    const report = r.call('report').prompt
    const part = (from, to) => report.slice(report.indexOf(from), report.indexOf(to))
    const ids = text => [...text.matchAll(/"id": "(?:shop\/)?(L-\d)"/g)].map(m => m[1])
    assert.deepEqual(ids(part('Findings kept (JSON):', 'Findings unproven (JSON):')), ['L-1', 'L-3'], `${workflow}: a structural finding and a runtime one proven by a run are kept`)
    assert.deepEqual(ids(part('Findings unproven (JSON):', 'Findings refuted (JSON):')), ['L-2', 'L-4'], `${workflow}: a runtime claim only traced, and one a skeptic found unproven, are unproven`)
    assert.match(report, /Unproven: the runtime findings no run has proven/)
    const skeptic = r.calls.find(c => c.label.startsWith('verify')).prompt
    assert.match(skeptic, /Check the proof, as the Proof part of the review findings contract says/)
    assert.match(skeptic, /`?unproven`? when the evidence holds but the finding is (a runtime claim no run has proven|such a claim and no run has proven it)/)
    assert.match(skeptic, /unless only a run could settle the doubt: then answer unproven\./)
    const refused = await run('proof, report refused', workflow, { findings, verdict, reportRefused: true })
    assert.match(refused.result, /\. 2 findings (were )?kept, 2 unproven,? (and )?0 refuted\.$/)
  }

  // 8. Three skeptics: a majority upholds, at least half refuting refutes, and anything else is unproven.
  {
    const cases = [
      [['confirmed', 'confirmed', 'unproven'], 'kept'],
      [['confirmed', 'unproven', 'refuted'], 'unproven'],
      [['unproven', 'unproven', 'confirmed'], 'unproven'],
      [['refuted', 'refuted', 'unproven'], 'refuted'],
      [['confirmed', 'refuted', 'refuted'], 'refuted'],
      // The third skeptic fails, so two answer: a tie between upholding and refuting refutes.
      [['confirmed', 'refuted', 'failed'], 'refuted'],
      [['unproven', 'refuted', 'failed'], 'refuted'],
      [['confirmed', 'unproven', 'failed'], 'unproven'],
    ]
    for (const [votes, outcome] of cases) {
      const failedVote = votes.indexOf('failed') + 1
      const r = await run(`votes ${votes}`, workflow, { args: 'shop --thorough', findings: [finding('L-1', 'lowy', 'major')], verdict: (f, vote) => votes[vote - 1], failedVote })
      const report = r.call('report').prompt
      assert.equal(r.calls.filter(c => c.label.startsWith('verify')).length, 3, `${workflow}: three skeptics`)
      const where = ['kept', 'unproven', 'refuted'].find(k => /"id": "(?:shop\/)?L-1"/.test(report.slice(report.indexOf(`Findings ${k} (JSON):`)).split(/\nFindings \w+ \(JSON\):/)[0]))
      assert.equal(where, outcome, `${workflow}: votes ${votes.join(', ')} leave the finding ${outcome}`)
    }
  }
}

console.log('lowy workflow tests passed')
