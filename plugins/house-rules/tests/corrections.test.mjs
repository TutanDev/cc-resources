// Tests for the transcript reader `/house-rules:correct` uses: scripts/corrections.mjs and its command line,
// scripts/list-corrections.mjs. Each test builds a Claude Code config folder with transcripts in a temporary
// folder, in the shapes Claude Code writes, and reads it the way the skill does.
// Run: node plugins/house-rules/tests/corrections.test.mjs
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { correctionsIn, transcriptFolderName } from '../scripts/corrections.mjs'

const CLI = fileURLToPath(new URL('../scripts/list-corrections.mjs', import.meta.url))

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

// Transcript entries, as Claude Code writes them.
let clock = 0
const at = () => new Date(Date.UTC(2026, 10, 2, 9, 0, clock++)).toISOString()
const typed = text => ({ type: 'user', promptSource: 'typed', timestamp: at(), message: { role: 'user', content: text } })
const tool = (name, input) => ({ type: 'assistant', timestamp: at(), message: { role: 'assistant', content: [{ type: 'tool_use', id: `t${clock}`, name, input }] } })
const result = text => ({ type: 'user', timestamp: at(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: text }] } })
const REJECTED =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file)."
const lines = entries => entries.map(entry => (typeof entry === 'string' ? entry : JSON.stringify(entry)))

const SESSION = lines([
  typed('Write the release notes for 0.3.0.'),
  tool('Read', { file_path: 'D:\\Repo\\CHANGELOG.md' }),
  tool('Edit', { file_path: 'D:\\Repo\\CHANGELOG.md', old_string: 'a', new_string: 'b' }),
  result('The file was updated.'),
  tool('Bash', { command: 'git commit -m "Add the 0.3.0 notes"' }),
  { type: 'user', timestamp: at(), message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } },
  typed("Don't edit the changelog by hand, ever."),
  tool('Write', { file_path: 'docs/notes.md', content: 'x' }),
  result(`${REJECTED} To tell you how to proceed, the user said:\nPut it in the README instead.`),
  tool('Bash', { command: 'rm -rf build' }),
  result(REJECTED),
  typed('No, keep the build folder.'),
  { type: 'user', isMeta: true, timestamp: at(), message: { role: 'user', content: 'Base directory for this skill: ...' } },
  { type: 'user', isCompactSummary: true, timestamp: at(), message: { role: 'user', content: 'Summary: ...' } },
  typed('This session is being continued from a previous conversation that ran out of context.'),
  typed('<command-message>house-rules:correct</command-message>\n<command-name>/house-rules:correct</command-name>'),
  typed('<local-command-stdout>Done</local-command-stdout>'),
  { type: 'user', promptSource: 'sdk', timestamp: at(), message: { role: 'user', content: 'Run the suite.' } },
  { type: 'user', isSidechain: true, timestamp: at(), message: { role: 'user', content: 'A subagent task.' } },
  '{"type":"user", broken',
  typed('Use this log instead: <pasted_content id="a1">line one\nline two</pasted_content id="a1"> and say what failed.'),
])

test('the folder name is the project path with every other character a dash', () => {
  assert.equal(transcriptFolderName('D:\\GIT\\cc-resources'), 'D--GIT-cc-resources')
  assert.equal(transcriptFolderName('/home/me/my_app.v2'), '-home-me-my-app-v2')
})

test('each thing the person typed comes with the tool calls just before it', () => {
  const records = correctionsIn(SESSION, 'aaaa1111')
  assert.deepEqual(
    records.map(({ said, after, interrupted, refused }) => ({ said, after, interrupted, refused })),
    [
      { said: 'Write the release notes for 0.3.0.', after: [], interrupted: false, refused: undefined },
      {
        said: "Don't edit the changelog by hand, ever.",
        after: ['Read D:\\Repo\\CHANGELOG.md', 'Edit D:\\Repo\\CHANGELOG.md', 'Bash git commit -m "Add the 0.3.0 notes"'],
        interrupted: true,
        refused: undefined,
      },
      { said: 'Put it in the README instead.', after: ['Write docs/notes.md'], interrupted: false, refused: 'Write docs/notes.md' },
      { said: 'No, keep the build folder.', after: ['Bash rm -rf build'], interrupted: false, refused: 'Bash rm -rf build' },
      { said: 'Use this log instead: [pasted 17 characters] and say what failed.', after: [], interrupted: false, refused: undefined },
    ],
  )
  assert.ok(records.every(record => record.session === 'aaaa1111' && record.at.startsWith('2026-11-02T09:00:')))
})

test('a pasted block closes with or without its id', () => {
  const said = correctionsIn(lines([typed('A <pasted_content>abc</pasted_content> and <pasted_content id="b2">de</pasted_content id="b2">.')]), 's').map(record => record.said)
  assert.deepEqual(said, ['A [pasted 3 characters] and [pasted 2 characters].'])
})

test('only the last six tool calls are kept, and a long input is cut', () => {
  const calls = Array.from({ length: 8 }, (_, index) => tool('Bash', { command: `step ${index} ${'x'.repeat(200)}` }))
  const [record] = correctionsIn(lines([...calls, typed('Stop.')]), 's')
  assert.equal(record.after.length, 6)
  assert.match(record.after[0], /^Bash step 2 x+\.\.\.$/)
  assert.equal(record.after[0].length, 'Bash '.length + 90)
})

// A config folder with two projects' transcripts; the reader is pointed at one of them.
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'house-rules-corrections-'))
  const project = resolve(root, 'work', 'my-app')
  const other = resolve(root, 'work', 'other-app')
  const folder = name => {
    const path = join(root, 'config', 'projects', transcriptFolderName(name))
    mkdirSync(path, { recursive: true })
    return path
  }
  writeFileSync(join(folder(project), 'bbbb2222-session.jsonl'), SESSION.join('\n'))
  clock = -86400
  writeFileSync(join(folder(project), 'cccc3333-session.jsonl'), lines([typed('An older correction.')]).join('\n'))
  mkdirSync(join(folder(project), 'bbbb2222-session', 'subagents'), { recursive: true })
  writeFileSync(join(folder(project), 'bbbb2222-session', 'subagents', 'agent-1.jsonl'), lines([typed('Inside a subagent.')]).join('\n'))
  writeFileSync(join(folder(other), 'dddd4444-session.jsonl'), lines([typed('From another project.')]).join('\n'))
  return { root, project, config: join(root, 'config') }
}
const run = (config, ...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, CLAUDE_CONFIG_DIR: config } })

test("the command line reads the project's own transcripts only, oldest first", () => {
  const { root, project, config } = fixture()
  try {
    const answer = run(config, project)
    assert.equal(answer.status, 0, answer.stderr)
    assert.match(answer.stdout, /^6 messages to the agents in 2 sessions of .*my-app, oldest first\.\n/)
    assert.ok(answer.stdout.indexOf('An older correction.') < answer.stdout.indexOf('Write the release notes'))
    assert.doesNotMatch(answer.stdout, /another project|Inside a subagent/)
    assert.match(
      answer.stdout,
      /\n\[2026-11-02 09:00\] session bbbb2222\n {2}After: Read D:\\Repo\\CHANGELOG\.md; Edit D:\\Repo\\CHANGELOG\.md; Bash git commit -m "Add the 0\.3\.0 notes"\n {2}The person interrupted the agent first\.\n {2}Said: Don't edit the changelog by hand, ever\.\n/,
    )
    assert.match(answer.stdout, /\n {2}The person refused: Bash rm -rf build\n {2}Said: No, keep the build folder\.(?:\n|$)/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('--since and --max narrow the list', () => {
  const { root, project, config } = fixture()
  try {
    const recent = run(config, project, '--since', '2026-11-02')
    assert.doesNotMatch(recent.stdout, /An older correction/)
    assert.match(recent.stdout, /^5 messages/)
    const last = run(config, project, '--max', '2')
    assert.match(last.stdout, /^2 messages to the agents in 1 sessions/)
    assert.match(last.stdout, /Said: Use this log instead/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a project with no transcripts folder, or a bad option, exits 2 and says why', () => {
  const { root, config } = fixture()
  try {
    const missing = run(config, resolve(root, 'work', 'new-app'))
    assert.equal(missing.status, 2)
    assert.match(missing.stderr, /No transcripts folder for .*new-app at .*work-new-app/)
    for (const args of [['--since', 'last week'], ['--max', '0'], ['a', 'b']]) {
      const wrong = run(config, ...args)
      assert.equal(wrong.status, 2)
      assert.match(wrong.stderr, /^usage: /)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

if (failed > 0) {
  console.log(`${failed} failed`)
  process.exit(1)
}
