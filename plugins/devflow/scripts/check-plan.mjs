#!/usr/bin/env node
// Checks devflow feature plans against their contract,
// references/feature-plan.md, and prints each problem as
// `<file>:<line>: <what to fix>`.
//
//   node plugins/devflow/scripts/check-plan.mjs cc-docs/plans/<feature>.md ...
//
// Exits 0 when every plan passes, 1 when any has a problem, and 2 when it is
// given no plan or cannot read one. The devflow hooks run the same check on
// every plan an agent reads or writes; this is the same check for people and CI.

import { readFileSync } from 'node:fs'
import { checkPlan } from './plan-structure.mjs'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: node check-plan.mjs <plan.md> [<plan.md> ...]')
  process.exit(2)
}

let problems = 0
let unread = 0
for (const file of files) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    console.error(`${file}: cannot be read: ${error.message}`)
    unread += 1
    continue
  }
  for (const problem of checkPlan(text)) {
    console.log(`${file}:${problem.line}: ${problem.message}`)
    problems += 1
  }
}

if (unread) process.exit(2)
if (problems) {
  console.error(`${problems} ${problems === 1 ? 'problem' : 'problems'} in ${files.length} ${files.length === 1 ? 'plan' : 'plans'}.`)
  process.exit(1)
}
console.log(`${files.length} ${files.length === 1 ? 'plan passes' : 'plans pass'} the structure check.`)
