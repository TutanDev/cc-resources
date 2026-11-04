import { atom, read, update } from 'claude-code'
import type { Register, ToolCallInput, ToolCallResult } from 'claude-code'

import type { DmfReview } from '../types'
import { REVIEWERS, registerReviewerLog } from './reviewer-log'

// Holds C# work to the dmf skills instead of leaving it to whether a skill's
// description happened to match the prompt. A standing section of the system
// prompt routes design, implementation and review to them; a C# edit is
// refused until the agent making it has loaded an implementation skill; and a
// turn that changed C# is sent back once, before it ends, to run the dmf
// reviewers on what it wrote.

// The agents that loaded an implementation skill in this conversation: `main`,
// or a subagent's id.
const guided = atom({ plugin: 'dmf', key: 'guided' } as const, [] as string[])
// The C# files written since the turn last ended.
const unreviewed = atom({ plugin: 'dmf', key: 'unreviewed' } as const, [] as string[])
// Whether a dmf reviewer ran since the turn last ended, or the turn was
// already sent back once to run one.
const review = atom({ plugin: 'dmf', key: 'review' } as const, 'none' as DmfReview)

const MAIN = 'main'
const agentOf = (e: { agentId?: string }) => e.agentId ?? MAIN

const IMPLEMENTATION_SKILLS = [
  'dmf:domain-modeling',
  'dmf:workflow-implementation',
  'dmf:serialization-persistence',
  'dmf:orchestrator',
]

// C# that a person writes; build output and generated code are not.
const CSHARP = /\.cs$/i
const GENERATED = /(?:^|[\\/])(?:obj|bin)[\\/]|\.(?:g|g\.i|designer|generated)\.cs$/i
const isAuthoredCSharp = (path: string) => CSHARP.test(path) && !GENERATED.test(path)

// A C# path as a shell names it: quoted, or a bare word.
const CSHARP_WORD = /"([^"]+\.cs)"|'([^']+\.cs)'|([^\s"'|;&<>()]+\.cs)(?![\w.])/gi
// The parts of a shell command that write the files they name: a redirect's
// target, an in-place sed, tee, and PowerShell's content cmdlets.
const SHELL_WRITES = [
  />>?\s*(?:"[^"]+"|'[^']+'|[^\s"'|;&<>()]+)/g,
  /\bsed\b[^|;&\r\n]*?\s(?:-i|--in-place)\b[^|;&\r\n]*/g,
  /\btee\b[^|;&\r\n]*/g,
  /\b(?:Set-Content|Add-Content|Out-File)\b[^|;\r\n]*/gi,
]

const csharpWords = (text: string) => [...text.matchAll(CSHARP_WORD)].map(match => match[1] ?? match[2] ?? match[3] ?? '')

const shellWrites = (command: string) =>
  SHELL_WRITES.flatMap(rule => [...command.matchAll(rule)].flatMap(match => csharpWords(match[0])))

// Serena's tools that change files, whatever its server is called; each names
// its file as `relative_path`, and `replace_in_files` may narrow by a glob.
const SERENA_EDIT =
  /^mcp__.*serena.*__(?:replace_symbol_body|insert_after_symbol|insert_before_symbol|replace_content|create_text_file|rename_symbol|safe_delete_symbol|replace_in_files)$/

const textField = (e: object, key: string) => {
  const value: unknown = (e as Record<string, unknown>)[key]
  return typeof value === 'string' && value !== '' ? [value] : []
}

// The files a call writes, as it names them.
const writtenFiles = (e: ToolCallInput): string[] => {
  if (e.tool === 'Edit' || e.tool === 'Write') return [e.file_path]
  if (e.tool === 'Bash' || e.tool === 'PowerShell') return shellWrites(e.command)
  if (SERENA_EDIT.test(String(e.tool))) return [...textField(e, 'relative_path'), ...textField(e, 'paths_include_glob')]
  return []
}

const succeeded = (answer: ToolCallResult) => answer.deny === undefined && answer.isError !== true

const withAll = (list: readonly string[], items: readonly string[]) => [...new Set([...list, ...items])]

const SHOWN = 10

const listed = (files: readonly string[]) =>
  [
    ...files.slice(0, SHOWN).map(file => `  ${file}`),
    ...(files.length > SHOWN ? [`  ... and ${files.length - SHOWN} more`] : []),
  ].join('\n')

const ROUTING = [
  '# Domain Modeling Made Functional',
  '',
  'Designing, implementing and reviewing C# follows the dmf skills.',
  'Load the one that fits with the Skill tool before the work starts, not after it:',
  '',
  '- Designing: a domain, its events, workflows or bounded contexts goes to `dmf:domain-discovery`; the types that encode it go to `dmf:domain-modeling`; a design that spans phases goes to `dmf:orchestrator`.',
  '- Implementing: domain types go to `dmf:domain-modeling`; workflow steps, pipelines, Result handling and dependency wiring go to `dmf:workflow-implementation`; DTOs, serializers and persistence go to `dmf:serialization-persistence`.',
  '- Reviewing: run the `dmf:dmf-reviewer` and `dmf:fp-reviewer` agents on the C# in scope, beside any other review.',
  '',
  'Code with little domain logic in it (an editor window, a MonoBehaviour, a test) still goes through the closest skill: the skills say how such code keeps logic pure and effects at the edge.',
  'A C# edit is refused until the agent making it has loaded `dmf:domain-modeling`, `dmf:workflow-implementation`, `dmf:serialization-persistence` or `dmf:orchestrator`, and a turn that changed C# is sent back once to run the dmf reviewers before it ends.',
].join('\n')

const unguided = (files: readonly string[]) =>
  [
    'dmf: this call writes C#, and this agent has not loaded a dmf implementation skill yet:',
    listed(files),
    'Load the one that fits with the Skill tool, follow it, then make the change again:',
    '  dmf:domain-modeling - domain types: value objects, entities, unions, smart constructors, lifecycle states',
    '  dmf:workflow-implementation - workflow steps and pipelines, Result handling, dependency wiring',
    '  dmf:serialization-persistence - DTOs, serializers, persistence, mapping at the edges',
    '  dmf:orchestrator - a change that spans several of those, or when unsure which fits',
    'Code with little domain logic in it still goes through the closest one.',
  ].join('\n')

const unreviewedReason = (files: readonly string[]) =>
  [
    'dmf: this turn changed C# and no dmf reviewer has looked at it:',
    listed(files),
    'Before ending the turn, run the dmf reviewers on these files with the Agent tool, in parallel:',
    '  dmf:fp-reviewer - for every C# change: purity, mutation, effects at the edges',
    '  dmf:dmf-reviewer - when domain types, workflows or DTOs changed',
    'Then fix what they find or report it.',
    'If the person asked for no review, say so and end the turn: this is asked once.',
  ].join('\n')

const REVIEWERS_IN_CODE_REVIEW = [
  '## dmf reviewers',
  '',
  'When the target includes C# files, also run the `dmf:dmf-reviewer` and `dmf:fp-reviewer` agents on them, in parallel with this review.',
  'Verify their findings as you verify your own, and report the ones that hold in this review\'s format.',
].join('\n')

const REVIEWERS_IN_SIMPLIFY = [
  '## dmf reviewer',
  '',
  'When the changed code includes C# files, also run the `dmf:fp-reviewer` agent on them, in parallel with this pass.',
  'Apply the refactors it proposes that hold up, as you apply your own.',
].join('\n')

const failed = { deny: 'dmf: its guard failed, so the call was refused.' }

export const register: Register = on => {
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.tools.includes('Skill')) return composed
    return { sections: [...composed.sections, { id: 'dmf:routing', text: ROUTING, scope: 'session' as const }] }
  })

  // A skill typed as a command is loaded into the main conversation.
  on('prompt.submit', async ($, e, next) => {
    const submitted = await next(e)
    if (e.command !== undefined && IMPLEMENTATION_SKILLS.includes(e.command.name) && !('drop' in submitted)) {
      await update($, guided, agents => withAll(agents, [MAIN]))
    }
    return submitted
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === 'Skill') {
      const ran = await next(e)
      if (succeeded(ran) && IMPLEMENTATION_SKILLS.includes(e.skill)) await update($, guided, agents => withAll(agents, [agentOf(e)]))
      return ran
    }
    const files = writtenFiles(e).filter(isAuthoredCSharp)
    if (files.length === 0) return next(e)
    if (!(await read($, guided)).includes(agentOf(e))) return { deny: unguided(files) }
    const ran = await next(e)
    if (succeeded(ran)) await update($, unreviewed, pending => withAll(pending, files))
    return ran
  }).catch(($, e, next) => (next.called ? next(e) : failed))

  // A fork carries its parent's context, the skills it loaded included; a
  // reviewer that starts has looked at what was written so far.
  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (spawned.deny !== undefined) return spawned
    if (e.fork && spawned.agentId !== undefined && (await read($, guided)).includes(e.parentAgentId ?? MAIN)) {
      const fork = spawned.agentId
      await update($, guided, agents => withAll(agents, [fork]))
    }
    if (REVIEWERS.includes(e.subagentType)) await update($, review, () => 'ran' as const)
    return spawned
  })

  // Sent back once per turn that changed C# and ran no dmf reviewer. A turn
  // that waits on background work ends as it is: the next one is judged.
  on('classic.Stop', async ($, e, next) => {
    const settled = await next(e)
    if ((e.background_tasks ?? []).length > 0) return settled
    const [pending, reviewed] = [await read($, unreviewed), await read($, review)]
    if (pending.length === 0 || reviewed !== 'none') {
      await update($, unreviewed, () => [])
      await update($, review, () => 'none' as const)
      return settled
    }
    await update($, review, () => 'asked' as const)
    const reason = unreviewedReason(pending)
    return { ...settled, block: settled.block === undefined ? reason : `${settled.block}\n\n${reason}` }
  })

  on('skill.prompt', { skill: 'code-review' }, async ($, e, next) => {
    const expanded = await next(e)
    return { text: `${expanded.text}\n\n${REVIEWERS_IN_CODE_REVIEW}` }
  })

  on('skill.prompt', { skill: 'simplify' }, async ($, e, next) => {
    const expanded = await next(e)
    return { text: `${expanded.text}\n\n${REVIEWERS_IN_SIMPLIFY}` }
  })

  // A /clear starts the conversation over: no skill is loaded in it any more.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, guided, () => [])
      await update($, unreviewed, () => [])
      await update($, review, () => 'none' as const)
    }
    return next(e)
  })

  registerReviewerLog(on)
}
