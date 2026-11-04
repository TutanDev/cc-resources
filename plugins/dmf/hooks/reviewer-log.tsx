import { atom, read, update } from 'claude-code'
import type {
  AgentSpawnInput,
  EngineInterface,
  On,
  TurnCompleteInput,
  TurnCompleteResult,
  TurnUsage,
} from 'claude-code'

import type { DmfReviewerRun, DmfReviewerTokens, DmfRunningReviewer } from '../types'

// Logs every run of the dmf reviewer agents: how long it took, the tokens it
// spent and the report it gave. Each run that ends leaves a line in the
// transcript, and /dmf-reviews opens a pane listing the runs of this session
// and earlier ones, with each run's full report a press away.

const PANE = 'dmf-reviews'
// The command's name is written out where it is registered and matched, as
// the engine reads it from the source.
const COMMAND = 'dmf-reviews'
export const REVIEWERS = ['dmf:dmf-reviewer', 'dmf:fp-reviewer']

// The runs kept across sessions. Each run is a store key of its own, so two
// reviewers that end together never write over each other; the version in the
// prefix lets a later shape of a run leave these behind.
const RUN_KEY = 'reviewer-run-1:'
const KEPT = 50
// A longer report is kept cut, which holds 50 runs far under the store's 4 MiB.
const OUTPUT_LIMIT = 40_000

const runs = atom({ plugin: 'dmf', key: 'reviewerRuns' } as const, [] as DmfReviewerRun[], { shape: 'runs-1' })
const running = atom({ plugin: 'dmf', key: 'reviewersRunning' } as const, [] as DmfRunningReviewer[], {
  shape: 'running-1',
})
const selected = atom({ plugin: 'dmf', key: 'reviewerRunShown' } as const, '')

const isReviewer = (type: string) => REVIEWERS.includes(type)

const ENDED = ['completed', 'failed', 'killed']

const tokensOf = (usage: TurnUsage): DmfReviewerTokens => ({
  input: usage.input_tokens,
  cacheWrite: usage.cache_creation_input_tokens,
  cacheRead: usage.cache_read_input_tokens,
  output: usage.output_tokens,
})

const totalOf = (tokens: DmfReviewerTokens) => tokens.input + tokens.cacheWrite + tokens.cacheRead + tokens.output

const isRun = (value: unknown): value is DmfReviewerRun => {
  if (typeof value !== 'object' || value === null) return false
  const run = value as Record<string, unknown>
  return (
    typeof run.id === 'string' &&
    typeof run.type === 'string' &&
    typeof run.endedAt === 'number' &&
    typeof run.durationMs === 'number' &&
    typeof run.output === 'string'
  )
}

// The kept runs and this session's, each once, oldest first, at most KEPT.
const merged = (kept: readonly DmfReviewerRun[], session: readonly DmfReviewerRun[]) =>
  [...new Map([...kept, ...session].map(run => [run.id, run])).values()]
    .sort((a, b) => a.endedAt - b.endedAt)
    .slice(-KEPT)

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

const formatDuration = (ms: number) => {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

const withCommas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const two = (n: number) => String(n).padStart(2, '0')

const formatTime = (ms: number) => {
  const d = new Date(ms)
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

const formatDate = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${formatTime(ms)}`
}

const shortType = (type: string) => type.replace(/^dmf:/, '')

const ENDINGS: Record<DmfReviewerRun['outcome'], string> = {
  answer: 'finished in',
  aborted: 'was stopped after',
  refusal: 'refused after',
  error: 'failed after',
}

const tokensLine = (run: DmfReviewerRun) =>
  run.tokens === undefined
    ? 'no tokens counted'
    : `${formatTokens(totalOf(run.tokens))} tokens, ${formatTokens(run.tokens.output)} of them output`

const noticeOf = (run: DmfReviewerRun) =>
  `${run.type} ${ENDINGS[run.outcome]} ${formatDuration(run.durationMs)} · ${tokensLine(run)} · /${COMMAND} shows its report`

const loadKept = async ($: EngineInterface) => {
  const keys = (await $.store.keys()).filter(key => key.startsWith(RUN_KEY))
  const values = await Promise.all(keys.map(key => $.store.get(key)))
  return values.filter(isRun)
}

// Keeps the run past the session, then drops the oldest kept beyond KEPT; the
// store lists keys in the order they were set.
const keep = async ($: EngineInterface, run: DmfReviewerRun) => {
  await $.store.set(RUN_KEY + run.id, run)
  const keys = (await $.store.keys()).filter(key => key.startsWith(RUN_KEY))
  for (const key of keys.slice(0, Math.max(0, keys.length - KEPT))) await $.store.delete(key)
}

// What is known of the reviewer that ran in this loop: recorded at its spawn,
// or, for one whose spawn this module did not see, from the agent list.
const reviewOf = async ($: EngineInterface, agentId: string, endedAt: number, durationMs: number) => {
  const recorded = (await read($, running)).find(review => review.agentId === agentId)
  if (recorded !== undefined) return recorded
  const listed = (await $.agent.list()).find(agent => agent.id === agentId && isReviewer(agent.type))
  if (listed === undefined) return undefined
  const review: DmfRunningReviewer = {
    agentId,
    type: listed.type,
    description: listed.description,
    startedAt: endedAt - durationMs,
  }
  return review
}

// The log never breaks what it logs: a failure in it is reported and passed
// over, so the spawn, the turn's end and the gate's own hooks on those events
// go on as they would without it.
const quietly = async ($: EngineInterface, work: () => Promise<unknown>) => {
  try {
    await work()
  } catch (error) {
    try {
      $.ui.log(`dmf: the reviewer log failed: ${String(error)}`)
    } catch {
      // Nothing is left to tell it with.
    }
  }
}

// Registers the command, loads the kept runs, and, after a reload, which keeps
// the session's values, forgets a reviewer that ended without this module
// hearing it.
const start = async ($: EngineInterface) => {
  await $.command.register({
    name: 'dmf-reviews',
    description: 'Show the dmf reviewer runs: how long each took, its tokens and its report',
  })
  const kept = await loadKept($)
  await update($, runs, session => merged(kept, session))
  const ended = new Set((await $.agent.list()).filter(agent => ENDED.includes(agent.status)).map(agent => agent.id))
  await update($, running, list => list.filter(review => !ended.has(review.agentId)))
}

const recordStart = async ($: EngineInterface, agentId: string, e: AgentSpawnInput) => {
  const review: DmfRunningReviewer = {
    agentId,
    type: e.subagentType,
    description: e.description,
    startedAt: await $.clock.now(),
  }
  await update($, running, list => [...list.filter(one => one.agentId !== agentId), review])
}

// Records a run of a subagent's loop when that loop is a dmf reviewer: in the
// session's list, as a line in the transcript, and in the store.
const recordEnd = async ($: EngineInterface, agentId: string, e: TurnCompleteInput, done: TurnCompleteResult) => {
  const endedAt = await $.clock.now()
  const review = await reviewOf($, agentId, endedAt, e.durationMs)
  if (review === undefined) return
  const usage = e.usage ?? done.usage
  const run: DmfReviewerRun = {
    id: e.turnId,
    agentId,
    type: review.type,
    description: review.description,
    project: folderName(await $.session.cwd()),
    endedAt,
    durationMs: e.durationMs,
    outcome: e.reason,
    ...(usage === undefined ? {} : { model: usage.model, tokens: tokensOf(usage) }),
    output: e.answer.slice(0, OUTPUT_LIMIT),
    isOutputCut: e.answer.length > OUTPUT_LIMIT,
  }
  await update($, running, list => list.filter(one => one.agentId !== agentId))
  await update($, runs, list => merged([], [...list, run]))
  await $.session.append({ message: { type: 'system', content: [{ type: 'text', text: noticeOf(run) }] } })
  await keep($, run)
}

export const registerReviewerLog = (on: On) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await quietly($, () => start($))
    return started
  })

  // A log never refuses a spawn: should this hook still fail, the spawn goes
  // on, or stands as it started.
  on('agent.spawn', { subagentType: REVIEWERS }, async ($, e, next) => {
    const spawned = await next(e)
    const agentId = spawned.agentId ?? e.resume?.agentId
    if (spawned.deny === undefined && agentId !== undefined) await quietly($, () => recordStart($, agentId, e))
    return spawned
  }).catch(($, e, next) => next(e))

  // Each run of a subagent's loop is one turn, so a reviewer resumed with a
  // message is logged again for that run.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const agentId = e.agentId
    if (agentId !== undefined) await quietly($, () => recordEnd($, agentId, e, done))
    return done
  })

  on('command.run', { command: 'dmf-reviews' }, async $ => {
    await update($, selected, () => '')
    const opened = await $.ui.open({ id: PANE, title: 'dmf reviews' })
    return { text: opened.isPlaced ? 'Opened the dmf reviews pane.' : `The dmf reviews pane waits: ${opened.reason}` }
  })

  // A /clear starts the conversation over; the runs stay, the pane returns to its list.
  on('session.end', { reason: 'clear' }, async ($, e, next) => {
    await update($, selected, () => '')
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const [list, live, chosen] = await Promise.all([read($, runs), read($, running), read($, selected)])
    const run = list.find(one => one.id === chosen)

    if (run !== undefined) {
      return (
        <Box flexDirection="column">
          <Button key="back" label="Back" hotkey="b" onPress={() => update($, selected, () => '')} />
          <Box flexDirection="column" marginTop={1}>
            <Text bold>{run.type}</Text>
            <Text dimColor>
              {formatDate(run.endedAt)} · {run.project}
            </Text>
            <Text>
              {ENDINGS[run.outcome]} {formatDuration(run.durationMs)}
              {run.model === undefined ? '' : ` on ${run.model}`}
            </Text>
            {run.tokens === undefined ? (
              <Text>No tokens counted.</Text>
            ) : (
              <Text>
                {formatTokens(totalOf(run.tokens))} tokens: {formatTokens(run.tokens.input)} input,{' '}
                {formatTokens(run.tokens.cacheWrite)} cache write, {formatTokens(run.tokens.cacheRead)} cache read,{' '}
                {formatTokens(run.tokens.output)} output
              </Text>
            )}
            {run.description !== '' && <Text dimColor>{run.description}</Text>}
          </Box>
          <Box flexDirection="column" marginTop={1}>
            <Markdown text={run.output === '' ? '_No report._' : run.output} />
            {run.isOutputCut && (
              <Text dimColor>The report is cut at its first {withCommas(OUTPUT_LIMIT)} characters.</Text>
            )}
          </Box>
        </Box>
      )
    }

    const spent = list.reduce((sum, one) => sum + (one.tokens === undefined ? 0 : totalOf(one.tokens)), 0)
    const took = list.reduce((sum, one) => sum + one.durationMs, 0)

    return (
      <Box flexDirection="column">
        {list.length > 0 && (
          <Text bold>
            {list.length} {list.length === 1 ? 'run' : 'runs'} · {formatTokens(spent)} tokens · {formatDuration(took)}
          </Text>
        )}
        {live.map(review => (
          <Text>
            {shortType(review.type)} <Text dimColor>running since {formatTime(review.startedAt)}</Text>
          </Text>
        ))}
        {list.length === 0 && live.length === 0 && <Text dimColor>No dmf reviewer has run yet.</Text>}
        {[...list].reverse().map(one => (
          <Button key={one.id} plain onPress={() => update($, selected, () => one.id)}>
            {shortType(one.type)} {formatDuration(one.durationMs)} ·{' '}
            {one.tokens === undefined ? 'no tokens' : `${formatTokens(totalOf(one.tokens))} tokens`}
            <Text dimColor>
              {' '}
              {formatDate(one.endedAt)} {one.project}
              {one.outcome === 'answer' ? '' : ` (${one.outcome})`}
            </Text>
          </Button>
        ))}
      </Box>
    )
  })
}
