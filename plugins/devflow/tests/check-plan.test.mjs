// Tests for the plan structure check, scripts/plan-structure.mjs, and its command line, scripts/check-plan.mjs.
// A sound plan and the template pass; each test breaks one rule of references/feature-plan.md in the sound plan
// and expects that rule's problem, on the line where it is fixed.
// Run: node plugins/devflow/tests/check-plan.test.mjs
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { checkPlan } from '../scripts/plan-structure.mjs'

const here = path => fileURLToPath(new URL(path, import.meta.url))
const PLAN = readFileSync(here('fixtures/discount-codes.md'), 'utf8')
const TEMPLATE = readFileSync(here('../references/plan-template.md'), 'utf8')
const CLI = here('../scripts/check-plan.mjs')
const FIXTURE = here('fixtures/discount-codes.md')

let failed = 0
const test = (name, fn) => {
  try {
    fn()
    console.log(`ok ${name}`)
  } catch (error) {
    failed += 1
    console.log(`FAIL ${name}\n${error.message}`)
  }
}

// The sound plan with `from` replaced by `to`; `from` must be in it, so a test never passes on a change it did not make.
const broken = (from, to, text = PLAN) => {
  assert.ok(text.includes(from), `the plan holds ${JSON.stringify(from)}`)
  return text.replace(from, to)
}
const lineOf = (needle, text = PLAN) => text.split('\n').findIndex(line => line.includes(needle)) + 1
const found = (text, pattern, line) => {
  const problems = checkPlan(text)
  const match = problems.find(problem => pattern.test(problem.message))
  assert.ok(match, `expected a problem matching ${pattern}, got:\n${problems.map(p => `  ${p.line}: ${p.message}`).join('\n') || '  none'}`)
  if (line !== undefined) assert.equal(match.line, line, `${pattern} on line ${line}`)
  return problems
}

test('a sound plan passes', () => assert.deepEqual(checkPlan(PLAN), []))
test('the template passes once its dates are filled', () => assert.deepEqual(checkPlan(TEMPLATE.replaceAll('<YYYY-MM-DD>', '2026-11-16')), []))
test('Windows line endings change nothing', () => assert.deepEqual(checkPlan(PLAN.replaceAll('\n', '\r\n')), []))
test('an empty plan is one problem', () => assert.deepEqual(checkPlan('\n\n').map(p => p.line), [1]))

test('header: the title, each field, its value and the order', () => {
  found(broken('# Plan: Discount Codes', '# Discount Codes'), /opens with its title/, 1)
  found(broken('> Status: reviewed\n', ''), /lacks `> Status:`/)
  found(broken('> Status: reviewed', '> Status: ready'), /is no status/, lineOf('> Status:'))
  found(broken('> Revision: 3, 2026-11-14', '> Revision: 3'), /reads `<n>, <YYYY-MM-DD>`/, lineOf('> Revision:'))
  found(broken('> Source: Let customers', '> Source:\n> Note: Let customers'), /`> Source:` is empty/)
  const swapped = broken('> Status: reviewed\n> Revision: 3, 2026-11-14', '> Revision: 3, 2026-11-14\n> Status: reviewed')
  found(swapped, /order Source, Status, Revision/)
})

test('sections: missing, misnamed, out of order, unknown, empty, twice', () => {
  const missing = broken('## 4. Architecture Impact (Löwy)\n', '')
  found(missing, /§4 Architecture Impact is missing: add `## 4\. Architecture Impact` after §3/, lineOf('## 5.', missing))
  found(broken('## 2. Scope', '## 2. Boundaries'), /§2 is named Scope/, lineOf('## 2. Scope'))
  const swapped = broken('## 1. Goal', '## 2. Goal').replace('## 2. Scope', '## 1. Scope')
  found(swapped, /§1 comes after §2/)
  found(broken('## 9. Decision Log', '## Notes\n\nSome notes.\n\n## 9. Decision Log'), /`## Notes` is not one of the plan's nine sections/)
  found(broken('## 9. Decision Log', '## 10. Appendix\n\nMore.\n\n## 9. Decision Log'), /§10 does not exist/)
  const empty = broken('Pricing rules are the axis, and PricingEngine already encapsulates it.\n', '')
  found(empty, /`### 4\.2 Volatility` is empty/, lineOf('### 4.2 Volatility'))
  found(broken('## 9. Decision Log', '## 1. Goal\n\nAgain.\n\n## 9. Decision Log'), /§1 appears twice/)
})

test('subsections of §4, §5, §7 and §8', () => {
  found(broken('### 4.4 Messaging\n\nNo messaging changes.\n', ''), /§4 lacks `### 4\.4 Messaging`/, lineOf('## 4.'))
  found(broken('### 5.3 Errors', '### 5.3 Failures'), /`### 5\.3 Failures` is not a subsection of §5/)
  const swapped = broken('### 7.1 Commands', '### 7.2 Scenarios').replace('### 7.2 Scenarios\n\n1.', '### 7.1 Commands\n\n1.')
  found(swapped, /out of order/)
  found(broken('### Assumptions', '### Guesses'), /§8 lacks `### Assumptions`/)
})

test('a heading inside a code block is not a heading', () => {
  const fenced = broken('dotnet test Shop.sln\n', 'dotnet test Shop.sln\n# runs every test\n## not a section\n')
  assert.deepEqual(checkPlan(fenced), [])
})

test('§2: the In scope and Out of scope lists', () => {
  found(broken('**Out of scope**', '**Later**'), /§2 has no \*\*Out of scope\*\* list/, lineOf('## 2. Scope'))
  found(broken('- Fixed-amount codes.\n- Stacking several codes on one order.\n', ''), /\*\*Out of scope\*\* list is empty/, lineOf('**Out of scope**'))
})

test('§3: use case headings, ids and fields', () => {
  found(broken('- **Failures:** a percentage', '- **Errors:** a percentage'), /UC-2 lacks `- \*\*Failures:\*\*`/, lineOf('### UC-2'))
  found(broken('### UC-2: Create a code', '### UC-1: Create a code'), /UC-1 appears twice in §3/, lineOf('### UC-2'))
  found(broken('### UC-2: Create a code', '### Create a code'), /is not a use case heading/)
  const reordered = broken('- **Trigger:** a support agent submits the new code form.\n- **Steps:** the code, its percentage and its expiry are validated and stored.', '- **Steps:** the code, its percentage and its expiry are validated and stored.\n- **Trigger:** a support agent submits the new code form.')
  found(reordered, /UC-2's fields go in the order Trigger, Steps, Outcome, Failures/)
  // A use case one level deeper, as an earlier contract showed it, still counts.
  assert.deepEqual(checkPlan(PLAN.replace('### UC-1:', '#### UC-1:').replace('### UC-2:', '#### UC-2:')), [])
})

test('every use case has a call chain, a phase and a scenario', () => {
  const added = broken('## 4. Architecture Impact', '### UC-3: Expire codes\n\n- **Trigger:** midnight.\n- **Steps:** expired codes are marked.\n- **Outcome:** they cannot be redeemed.\n- **Failures:** none the user sees.\n\n## 4. Architecture Impact')
  found(added, /§4\.3 has no call chain for UC-3/, lineOf('### 4.3', added))
  found(added, /UC-3 is completed by no phase: name it in the Goal/, lineOf('## 6. Phases', added))
  found(added, /UC-3 has no scenario in §7\.2/, lineOf('### 7.2', added))
  assert.equal(checkPlan(added).length, 3)
})

test('§6: phase headings, fields and status', () => {
  found(PLAN.replace('## 6. Phases\n\n', '## 6. Phases\n\nNone yet.\n\n').replace(/### Phase[\s\S]*?(?=## 7\.)/, ''), /§6 has no phase/)
  found(broken('### Phase 2: Redeem and create codes', '### Step 2: Redeem and create codes'), /is not a phase heading/)
  found(broken('### Phase 2:', '### Phase 1:'), /Phase 1 appears twice/)
  found(broken('### Phase 1:', '### Phase 0:').replace('### Phase 2:', '### Phase 1:').replace('`AC-1.', '`AC-0.').replace('`AC-1.', '`AC-0.').replaceAll('`AC-2.', '`AC-1.').replace('Phase 1\n', 'Phase 0\n'), /number the phases from 1/)
  found(broken('- **Status:** pending\n\n### Phase 2', '\n### Phase 2'), /Phase 1 lacks `- \*\*Status:\*\*`/, lineOf('### Phase 1'))
  found(broken('- **Status:** pending\n\n## 7.', '- **Status:** started\n\n## 7.'), /Phase 2's Status is `started`/)
})

test('§6: what a phase depends on', () => {
  found(broken('- **Depends on:** none', '- **Depends on:** Phase 2'), /Phase 1 depends on Phase 2, which is not earlier/, lineOf('- **Depends on:** none'))
  found(broken('- **Depends on:** Phase 1', '- **Depends on:** Phases 1 and 4'), /depends on Phase 4, which is not earlier/)
  found(broken('- **Depends on:** Phase 1', '- **Depends on:** the types'), /Depends on names no phase/)
})

test('§6: acceptance criteria ids', () => {
  found(broken('`AC-2.2`', '`AC-1.2`'), /`AC-1\.2` is in Phase 2: a criterion's id starts with its phase's number/, lineOf('`AC-2.2`'))
  found(broken('`AC-1.2`', '`AC-1.1`'), /`AC-1\.1` is used twice/, lineOf('`AC-1.2`'))
  found(broken('  - `AC-2.1` an integration test', '  - an integration test'), /opens with its id in code/)
  const none = broken('  - `AC-2.1` an integration test redeems a valid code and sees the reduced total.\n  - `AC-2.2` an integration test redeems an expired code and gets `ExpiredCode`.\n', '')
  found(none, /Phase 2 has no acceptance criterion/)
})

test('§7: commands and scenarios', () => {
  found(broken('dotnet build Shop.sln\ndotnet test Shop.sln\n', ''), /§7\.1 has no command/, lineOf('### 7.1'))
  const unnumbered = broken('1. **Redeem a code** (UC-1)', 'Redeem a code (UC-1)').replace('2. **Create a code** (UC-2)', 'Create a code (UC-2)')
  found(unnumbered, /§7\.2 has no scenario/)
})

test('§8: questions and their fields', () => {
  found(broken('  - **Recommendation:** no count', '  - **Advice:** no count'), /Q-2 lacks `\*\*Recommendation:\*\*`/, lineOf('`Q-2`'))
  found(broken('  - **Evidence:** `curl', '  - **Proof:** `curl'), /Q-1 lacks `\*\*Evidence:\*\*`/, lineOf('`Q-1`'))
  found(broken('- `Q-2` Should', '- `Q-1` Should'), /Q-1 appears twice in §8/)
  found(broken('- `Q-2` Should', '- Should'), /is not a question/)
  found(broken('Q-1 settled by probe', 'Q-2 answered, 2026-11-14: no count; applied in §2.\n\nQ-1 settled by probe'), /Q-2 is still open in §8, but §9 records it answered/, lineOf('`Q-2`'))
  const none = PLAN.replace(/(### Open Questions\n\n)[\s\S]*?(?=### Settled)/, '$1- None.\n\n')
  assert.deepEqual(checkPlan(none), [])
})

test('§9: round headings and their numbers', () => {
  found(broken('#### Round 1, 2026-11-14', '#### Round 2, 2026-11-14'), /Round 2 is logged where round 1 belongs/)
  found(broken('#### Round 1, 2026-11-14 (discount', '#### Round 1 on 2026-11-14 (discount'), /A round's heading is/)
})

test('the status: approved, reviewed, in-progress and done', () => {
  const approved = broken('> Status: reviewed', '> Status: approved')
  found(approved, /Q-2 is open, and an approved plan has no open question/, lineOf('`Q-2`'))
  found(approved, /§9 records no `Approved by the user/, lineOf('> Status:'))
  const unlogged = PLAN.replace(/#### Round 1[\s\S]*$/, '')
  found(unlogged, /The plan is reviewed, but §9 logs no review round/)
  found(broken('- **Status:** pending', '- **Status:** done'), /Phase 1 is done, but the plan is reviewed/)
  found(broken('> Status: reviewed', '> Status: in-progress'), /in-progress, but no phase is done/)
  found(broken('> Status: reviewed', '> Status: done').replace('- **Status:** pending', '- **Status:** done'), /Phase 2 is not done, but the plan is done/)
})

test('no message names a line number, so a problem keeps its message when lines move', () => {
  const plans = [
    broken('## 4. Architecture Impact (Löwy)\n', ''),
    broken('> Status: reviewed', '> Status: approved'),
    broken('`AC-2.2`', '`AC-1.2`'),
  ]
  for (const problem of plans.flatMap(checkPlan)) assert.doesNotMatch(problem.message, /\bline \d/)
})

test('the command line prints file:line and exits 0, 1 or 2', () => {
  const pass = spawnSync(process.execPath, [CLI, FIXTURE], { encoding: 'utf8' })
  assert.equal(pass.status, 0, pass.stderr)
  assert.match(pass.stdout, /1 plan passes/)
  const fail = spawnSync(process.execPath, [CLI, here('../references/plan-template.md')], { encoding: 'utf8' })
  assert.equal(fail.status, 1)
  assert.match(fail.stdout, /plan-template\.md:5: `> Revision:` reads/)
  assert.equal(spawnSync(process.execPath, [CLI], { encoding: 'utf8' }).status, 2)
  assert.equal(spawnSync(process.execPath, [CLI, here('fixtures/missing.md')], { encoding: 'utf8' }).status, 2)
})

if (failed) {
  console.log(`check-plan: ${failed} failed`)
  process.exit(1)
}
console.log('check-plan: all tests passed')
