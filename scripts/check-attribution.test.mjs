// Tests for scripts/check-attribution.mjs: what counts as attribution, which commits an event adds,
// and the script end to end on a repository of its own, as CI runs it.
// Run: node scripts/check-attribution.test.mjs
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attributionIn, commitsFor } from './check-attribution.mjs'

const SCRIPT = fileURLToPath(new URL('./check-attribution.mjs', import.meta.url))
const SESSION = 'Claude-Session: https://claude.ai/code/session_01AbCdEfGhIjKlMnOpQrStUv'
const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
let failures = 0

function check(name, run) {
  try {
    run()
    console.log(`ok - ${name}`)
  } catch (error) {
    failures += 1
    console.log(`not ok - ${name}\n${error.message}`)
  }
}

check('each kind of attribution is found, with its line', () => {
  const message = `Fix the thing\n\nWhy it broke.\n\n${TRAILER}\n${SESSION}\n`
  assert.deepEqual(attributionIn(message), [
    { name: 'a Co-Authored-By trailer naming Claude or Anthropic', line: TRAILER },
    { name: 'a Claude-Session link', line: SESSION },
  ])
  const footer = 'Summary\r\n\r\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\r\n'
  assert.deepEqual(attributionIn(footer).map(({ name }) => name), ['a "Generated with Claude Code" line'])
})

check('a message that only talks about attribution, or credits a person, carries none', () => {
  const messages = [
    'Strip the Co-Authored-By: Claude trailer from old commits',
    'Hold the Claude-Session: link out of pull requests',
    'Hold the footer out\n\nA session no longer ends pull requests with the "Generated with Claude Code" line.',
    'Fix the thing\n\nCo-Authored-By: Ada Lovelace <ada@example.com>',
  ]
  for (const message of messages) assert.deepEqual(attributionIn(message), [], message)
})

check('a pull request is judged on what its head adds to its base', () => {
  assert.deepEqual(commitsFor({ BASE_SHA: 'b1', HEAD_SHA: 'h1', BEFORE_SHA: '' }, () => true), ['b1..h1'])
})

check('a push is judged on what it moved its branch past', () => {
  assert.deepEqual(commitsFor({ BEFORE_SHA: 'p1', HEAD_SHA: 'h1', DEFAULT_BRANCH: 'main' }, () => true), ['p1..h1'])
})

check("a new branch, or a force push whose old head is gone, is judged on what it adds to the default branch", () => {
  const known = revision => revision === 'origin/main'
  const zero = '0000000000000000000000000000000000000000'
  assert.deepEqual(commitsFor({ BEFORE_SHA: zero, HEAD_SHA: 'h1', DEFAULT_BRANCH: 'main' }, known), ['origin/main..h1'])
  assert.deepEqual(commitsFor({ BEFORE_SHA: 'gone', HEAD_SHA: 'h1', DEFAULT_BRANCH: 'main' }, known), ['origin/main..h1'])
})

check('with nothing to compare against, only the head commit is judged', () => {
  assert.deepEqual(commitsFor({ HEAD_SHA: 'h1' }, () => false), ['-1', 'h1'])
})

// A repository whose main already holds an attributed commit, and a branch that adds one clean commit and one attributed one.
const scratch = mkdtempSync(join(tmpdir(), 'check-attribution-'))
const git = (...args) =>
  execFileSync('git', args, {
    cwd: scratch,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' },
  }).trim()
const commit = message => {
  writeFileSync(join(scratch, 'file.txt'), message)
  git('add', 'file.txt')
  git('commit', '-q', '-m', message)
  return git('rev-parse', 'HEAD')
}
const run = (env, args = []) => {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['BASE_SHA', 'HEAD_SHA', 'BEFORE_SHA', 'DEFAULT_BRANCH', 'PR_BODY', 'GITHUB_ACTIONS'].includes(key)))
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: scratch, encoding: 'utf8', env: { ...clean, ...env } })
}

try {
  git('init', '-q', '-b', 'main')
  git('config', 'core.autocrlf', 'false')
  const old = commit(`Old work\n\n${TRAILER}`)
  git('checkout', '-q', '-b', 'feature')
  const clean = commit('Add the clean part')
  const attributed = commit(`Add the attributed part\n\n${SESSION}`)

  check('a push that adds an attributed commit fails, names it and says how to fix it', () => {
    const result = run({ BEFORE_SHA: clean, HEAD_SHA: attributed })
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stderr, new RegExp(`Commit ${attributed.slice(0, 7)}\\w* \\(Add the attributed part\\) carries Claude attribution`))
    assert.match(result.stderr, /a Claude-Session link: Claude-Session: https:\/\/claude\.ai/)
    assert.match(result.stderr, /git commit --amend/)
  })

  check('a push of clean commits passes, though the history before them is attributed', () => {
    const result = run({ BEFORE_SHA: old, HEAD_SHA: clean })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /Checked 1 commit \(git log /)
  })

  check('a pull request whose body carries attribution fails, and says to edit the description', () => {
    const result = run({ BASE_SHA: old, HEAD_SHA: clean, PR_BODY: `Adds the clean part.\n\n${SESSION}` })
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stderr, /The pull request body carries Claude attribution/)
    assert.match(result.stderr, /Edit the pull request's description/)
    assert.doesNotMatch(result.stderr, /Commit /)
  })

  check('in GitHub Actions each problem is one error annotation', () => {
    const result = run({ BEFORE_SHA: clean, HEAD_SHA: attributed, GITHUB_ACTIONS: 'true' })
    assert.equal(result.status, 1)
    const lines = result.stderr.trim().split('\n')
    assert.equal(lines.length, 1, result.stderr)
    assert.match(lines[0], /^::error::Commit \w+ \(Add the attributed part\) carries Claude attribution:%0A/)
  })

  check('a range given by hand, and a body read from a file, are judged the same way', () => {
    writeFileSync(join(scratch, 'body.md'), `Body\n\n${SESSION}\n`)
    assert.equal(run({}, [`${old}..${clean}`]).status, 0)
    assert.equal(run({}, [`${clean}..${attributed}`]).status, 1)
    assert.equal(run({}, ['-1', clean, '--body', join(scratch, 'body.md')]).status, 1)
  })
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

if (failures > 0) {
  console.log(`${failures} failed`)
  process.exitCode = 1
}
