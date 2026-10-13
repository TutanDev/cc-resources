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

const finding = (id, lens, severity) => ({
  id, lens, rule: 'r', status: 'violation', severity, file: 'a.cs', lines: '1', evidence: 'e', problem: 'p', fix: 'f', profileRef: '', occurrences: [],
})
const loads = {
  'arch-audit': legacyDocs => ({ repoRoot: '/r', targetName: 'shop', profilePath: 'cc-docs/architecture.md', today: '2026-10-12', revision: 'abc main', subsystems: [{ name: 'shop', path: 'src', why: 'w' }], skipped: [], legacyDocs }),
  'design-check': legacyDocs => ({ repoRoot: '/r', designDir: 'cc-docs/design/shop', topic: 'shop', today: '2026-10-12', profilePath: '', files: ['03-layered-architecture.md'], stale: [], useCases: [{ name: 'checkout', description: 'd', source: '02 §2' }], volatilities: [], legacyDocs, note: '' }),
}

async function run(name, workflow, { args = 'shop', legacyDocs = false, checkRefused = false, checkFails = false, readRefused = false, readFails = false, reportRefused = false, reportFails = false } = {}) {
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
      return workflow === 'arch-audit'
        ? { verdicts: [{ id: 'L-1', verdict: 'confirmed', status: 'violation', severity: 'major', reason: 'ok' }] }
        : { verdict: 'confirmed', status: 'violation', severity: 'major', reason: 'ok' }
    }
    // A reviewer or a check.
    return { findings: [finding('L-1', label.split(':')[0], 'major')], summary: 's', aligned: [], profileGaps: [], notChecked: [] }
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
}

console.log('lowy workflow tests passed')
