import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'

import { checkPlan, type PlanProblem } from '../scripts/plan-structure.mjs'
import type { DevflowPlanWrite } from '../types'

// Holds feature plans to their contract, references/feature-plan.md, where
// agents read and write them, with the check scripts/check-plan.mjs runs:
// - a write that breaks the contract where the plan held it tells the agent
//   what broke, in the write's own result;
// - an agent that hands back a plan it broke is sent back once to fix it;
// - every read of a plan carries the check's result, so the review workflow's
//   Load phase and the delivery reviewer start from it.
// Problems a plan had before an agent first wrote it are not that agent's:
// a writer applies rulings and answers, and changes nothing else.

// cc-docs/plans/<feature>.md, wherever the repository is.
const PLAN = /(?:^|[\\/])cc-docs[\\/]plans[\\/][^\\/]+\.md$/i

const MAIN = 'main'
const agentOf = (e: { agentId?: string }) => e.agentId ?? MAIN

// The plans each agent wrote since it last handed back.
const written = atom({ plugin: 'devflow', key: 'written' } as const, [] as DevflowPlanWrite[])
// The agents sent back once to fix a plan they broke.
const sentBack = atom({ plugin: 'devflow', key: 'sentBack' } as const, [] as string[])

const samePath = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()

const readPlan = ($: EngineInterface, path: string) => $.fs.read(path).catch(() => undefined)

const messages = (text: string | undefined) => (text === undefined ? [] : checkPlan(text).map(problem => problem.message))

// The problems an agent's writes added to a plan.
const added = (text: string, before: readonly string[]) => checkPlan(text).filter(problem => !before.includes(problem.message))

const SHOWN = 20

const listed = (path: string, problems: readonly PlanProblem[]) =>
  [
    ...problems.slice(0, SHOWN).map(problem => `  ${path}:${problem.line}: ${problem.message}`),
    ...(problems.length > SHOWN ? [`  ... and ${problems.length - SHOWN} more`] : []),
  ].join('\n')

const CONTRACT = 'its contract, references/feature-plan.md in the devflow plugin'

// Both list only what the agent's writes added since its first write, so they
// hold for a plan it created and one it changed alike.
const brokenByWrite = (path: string, problems: readonly PlanProblem[]) =>
  [
    `devflow: your writes to this plan break ${CONTRACT}:`,
    listed(path, problems),
    'Fix each before you hand the plan back, unless an edit you are about to make fixes it: the plan is checked again when you finish.',
  ].join('\n')

const brokenAtEnd = (plans: readonly { path: string; problems: readonly PlanProblem[] }[]) =>
  [
    `devflow: your writes to ${plans.length === 1 ? 'this plan' : 'these plans'} break ${CONTRACT}:`,
    ...plans.map(plan => listed(plan.path, plan.problems)),
    'Fix each with an edit, then answer as you were going to.',
    'If a fix needs a decision that is not yours, say so in your answer instead: this is asked once.',
  ].join('\n')

const checked = (path: string, problems: readonly PlanProblem[]) =>
  problems.length === 0
    ? `devflow: the plan structure check (scripts/check-plan.mjs) passes ${path}.`
    : [`devflow: the plan structure check (scripts/check-plan.mjs) finds ${problems.length} ${problems.length === 1 ? 'problem' : 'problems'} in this plan:`, listed(path, problems)].join('\n')

const withContext = (answer: ToolCallResult, text: string): ToolCallResult => {
  if (answer.deny !== undefined || answer.isError === true) return answer
  return { ...answer, context: [...(answer.context ?? []), text] }
}

const withBlock = <T extends { block?: string }>(settled: T, reason: string | undefined): T =>
  reason === undefined ? settled : { ...settled, block: settled.block === undefined ? reason : `${settled.block}\n\n${reason}` }

// A write to a plan: the problems it had before the agent's first write are
// kept, and what the write added is told in its result.
const onWrite = async ($: EngineInterface, e: { file_path: string; agentId?: string }, run: () => Promise<ToolCallResult>) => {
  if (!PLAN.test(e.file_path)) return run()
  const agent = agentOf(e)
  const known = (await read($, written)).find(entry => entry.agent === agent && samePath(entry.path, e.file_path))
  const before = known ? known.before : messages(await readPlan($, e.file_path))
  const ran = await run()
  if (ran.deny !== undefined || ran.isError === true) return ran
  if (!known) await update($, written, list => [...list, { agent, path: e.file_path, before }])
  const after = await readPlan($, e.file_path)
  if (after === undefined) return ran
  const problems = added(after, before)
  return problems.length === 0 ? ran : withContext(ran, brokenByWrite(e.file_path, problems))
}

// What an agent that ends its turn left broken: sent back once, then let go.
const handBack = async ($: EngineInterface, agent: string) => {
  const mine = (await read($, written)).filter(entry => entry.agent === agent)
  if (mine.length === 0) return undefined
  const broken: { path: string; problems: PlanProblem[] }[] = []
  for (const entry of mine) {
    const text = await readPlan($, entry.path)
    const problems = text === undefined ? [] : added(text, entry.before)
    if (problems.length > 0) broken.push({ path: entry.path, problems })
  }
  if (broken.length === 0 || (await read($, sentBack)).includes(agent)) {
    await update($, written, list => list.filter(entry => entry.agent !== agent))
    await update($, sentBack, list => list.filter(other => other !== agent))
    return undefined
  }
  await update($, sentBack, list => [...list, agent])
  return brokenAtEnd(broken)
}

export const register: Register = on => {
  on('tool.call', { tool: 'Write' }, ($, e, next) => onWrite($, e, () => next(e))).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'Edit' }, ($, e, next) => onWrite($, e, () => next(e))).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const ran = await next(e)
    if (!PLAN.test(e.file_path)) return ran
    const text = await readPlan($, e.file_path)
    return text === undefined ? ran : withContext(ran, checked(e.file_path, checkPlan(text)))
  }).catch(($, e, next) => next(e))

  on('classic.SubagentStop', async ($, e, next) => withBlock(await next(e), await handBack($, e.agent_id)))

  // A turn that waits on background work ends as it is: the next one is judged.
  on('classic.Stop', async ($, e, next) => {
    const settled = await next(e)
    if ((e.background_tasks ?? []).length > 0) return settled
    return withBlock(settled, await handBack($, MAIN))
  })

  // A /clear starts the conversation over.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, written, () => [])
      await update($, sentBack, () => [])
    }
    return next(e)
  })
}
