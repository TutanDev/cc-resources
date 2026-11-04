import type { AgentInfo, AgentSpawnInput, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import type { DmfReviewerRun } from '../types'

const PANE = {
  plugin: 'dmf',
  component: 'Pane',
  requestId: 'dmf-reviews',
  props: {
    title: 'dmf reviews',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

const START = { cwd: 'D:\\work\\game', surface: 'terminal', isInteractive: true } as const

const USAGE = {
  model: 'claude-opus-5-5',
  input_tokens: 2000,
  cache_creation_input_tokens: 7300,
  cache_read_input_tokens: 170_000,
  output_tokens: 3100,
}

// Nothing sits beneath the plugin: these hooks stand for the engine.
const engine = (on: On, agents: AgentInfo[] = []) => {
  on('command.register', () => ({ value: { command: 'dmf-reviews' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'D:\\work\\game' }))
  on('agent.list', () => ({ value: agents }))
  on('agent.spawn', (_, e) => ({ model: 'claude-opus-5-5', agentId: e.subagentType === 'Explore' ? 'x1' : 'r1' }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
}

// The plugin's store, in memory, where the test can read what was kept; a Map
// lists its keys in the order they were set, as the engine's store does.
const memoryStore = (on: On, entries: Record<string, unknown> = {}) => {
  const store = new Map(Object.entries(entries))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.delete(e.key), store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_, e) => (store.delete(e.key), { value: undefined }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  return store
}

// An Agent call as the engine raises it.
const spawn = (subagentType: string, description = 'Review orders'): AgentSpawnInput => ({
  tool_use_id: `call-${subagentType}`,
  prompt: 'Review Orders.cs',
  description,
  subagentType,
  provider: { plugin: 'dmf', tier: 'user' },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
})

const keptRun = (id: string, endedAt: number): DmfReviewerRun => ({
  id,
  agentId: `a-${id}`,
  type: 'dmf:dmf-reviewer',
  description: 'Review types',
  project: 'game',
  endedAt,
  durationMs: 30_000,
  outcome: 'answer',
  model: 'claude-opus-5-5',
  tokens: { input: 1000, cacheWrite: 0, cacheRead: 9000, output: 0 },
  output: 'Fine.',
  isOutputCut: false,
})

test('a dmf reviewer run is noticed, kept and shown with its time, tokens and report', async ($, on) => {
  const store = memoryStore(on)
  mock.clock(on, { now: 1_800_000_000_000 })
  const session = mock.session(on)
  engine(on)

  await $.session.start(START)
  await $.agent.spawn(spawn('dmf:fp-reviewer'))
  await $.turn.complete({
    agentId: 'r1',
    turnId: 't1',
    answer: '## Findings\n\nNone.',
    durationMs: 72_000,
    isAborted: false,
    reason: 'answer',
    usage: USAGE,
  })

  expect(session.appended().map(row => row.message.content)).toEqual([
    [
      {
        type: 'text',
        text: 'dmf:fp-reviewer finished in 1m 12s · 182.4k tokens, 3.1k of them output · /dmf-reviews shows its report',
      },
    ],
  ])
  expect([...store.keys()]).toEqual(['reviewer-run-1:t1'])

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /1 run/ }))?.text).toBe('1 run · 182.4k tokens · 1m 12s')

    await ui.press({ key: 't1' })
    expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe('## Findings\n\nNone.')
    expect((await ui.find({ type: 'Text', text: /tokens:/ }))?.text).toBe(
      '182.4k tokens: 2.0k input, 7.3k cache write, 170.0k cache read, 3.1k output',
    )
    expect(await ui.find({ type: 'Text', text: /Review orders/ })).toBeDefined()

    await ui.press({ key: 'back' })
    expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
    await ui.unmount()
  }
})

test('a reviewer is shown as running until its run ends', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  engine(on)

  await $.session.start(START)
  await $.agent.spawn(spawn('dmf:dmf-reviewer'))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /running since/ })).toBeDefined()

  await $.turn.complete({ agentId: 'r1', turnId: 't1', answer: 'Fine.', durationMs: 5000, isAborted: false, reason: 'answer' })
  expect(await ui.find({ type: 'Text', text: /running since/ })).toBeUndefined()
  await ui.unmount()
})

test('an agent that is no dmf reviewer, and the main loop, are not logged', async ($, on) => {
  const store = memoryStore(on)
  mock.clock(on)
  const session = mock.session(on)
  engine(on)

  await $.session.start(START)
  await $.agent.spawn(spawn('Explore', 'Find the order files'))
  await $.turn.complete({ agentId: 'x1', turnId: 'x', answer: 'Found.', durationMs: 1000, isAborted: false, reason: 'answer', usage: USAGE })
  await $.turn.complete({ turnId: 'm', answer: 'Done.', durationMs: 1000, isAborted: false, reason: 'answer', usage: USAGE })

  expect(session.appended()).toEqual([])
  expect([...store.keys()]).toEqual([])
})

test('a stopped reviewer whose spawn was not seen is logged from the agent list', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const session = mock.session(on)
  engine(on, [{ id: 'r9', type: 'dmf:dmf-reviewer', description: 'Review types', status: 'killed' }])

  await $.session.start(START)
  await $.turn.complete({ agentId: 'r9', turnId: 't9', answer: '', durationMs: 20_000, isAborted: true, reason: 'aborted' })

  expect(session.appended().map(row => row.message.content)).toEqual([
    [{ type: 'text', text: 'dmf:dmf-reviewer was stopped after 20s · no tokens counted · /dmf-reviews shows its report' }],
  ])
})

test('runs kept by earlier sessions are listed, and the newest 50 are kept', async ($, on) => {
  const earlier = Array.from({ length: 50 }, (_, i) => keptRun(`old${i}`, 1_700_000_000_000 + i * 1000))
  const store = memoryStore(on, Object.fromEntries(earlier.map(run => [`reviewer-run-1:${run.id}`, run])))
  mock.clock(on, { now: 1_800_000_000_000 })
  engine(on)

  await $.session.start(START)
  await $.agent.spawn(spawn('dmf:fp-reviewer'))
  await $.turn.complete({ agentId: 'r1', turnId: 't1', answer: 'Fine.', durationMs: 1000, isAborted: false, reason: 'answer', usage: USAGE })

  const keys = [...store.keys()]
  expect(keys).toHaveLength(50)
  expect(keys).not.toContain('reviewer-run-1:old0')
  expect(keys).toContain('reviewer-run-1:t1')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /runs/ }))?.text).toMatch(/^50 runs · /)
  const rows = await ui.findAll({ type: 'Button' })
  expect(rows[0]?.key).toBe('t1')
  await ui.unmount()
})

test('a kept value that is no run is passed over', async ($, on) => {
  mock.store(on, { 'reviewer-run-1:bad': { id: 3 }, 'reviewer-run-1:good': keptRun('good', 1_700_000_000_000) })
  mock.clock(on)
  engine(on)

  await $.session.start(START)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /run/ }))?.text).toMatch(/^1 run · /)
  await ui.unmount()
})

test('a log that fails passes the spawn and the end of the turn on as they were', async ($, on) => {
  // No clock answers here, so every record the log makes fails.
  mock.store(on)
  engine(on)

  await $.session.start(START)
  expect((await $.agent.spawn(spawn('dmf:fp-reviewer'))).agentId).toBe('r1')
  const done = await $.turn.complete({ agentId: 'r1', turnId: 't1', answer: 'Fine.', durationMs: 1000, isAborted: false, reason: 'answer' })
  expect(done.text).toBe('Fine.')
})
