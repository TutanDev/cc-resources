import type { On, ToolCallResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { checkPlan } from '../scripts/plan-structure.mjs'

const PLAN_PATH = 'D:/Shop/cc-docs/plans/discount-codes.md'
const OTHER_PATH = 'D:/Shop/docs/notes.md'

const PLAN = `# Plan: Discount Codes

> Source: Let customers redeem a discount code at checkout
> Status: draft
> Revision: 1, 2026-11-16

## 1. Goal

Customers redeem a discount code at checkout and see the reduced total.

## 2. Scope

**In scope**

- Percentage codes.

**Out of scope**

- Fixed-amount codes.

## 3. Use Cases

### UC-1: Redeem a code

- **Trigger:** a customer enters a code.
- **Steps:** the code is found and applied.
- **Outcome:** the total is reduced.
- **Failures:** an unknown code is refused with a reason.

## 4. Architecture Impact (Löwy)

### 4.1 Services

OrderManager changes.

### 4.2 Volatility

Pricing rules, in PricingEngine.

### 4.3 Call Chains

UC-1: CheckoutClient, then OrderManager, then PricingEngine.

### 4.4 Messaging

No messaging changes.

## 5. Domain Model Impact (DMF)

### 5.1 Types

A Percentage type.

### 5.2 Workflows

ApplyCode.

### 5.3 Errors

UnknownCode.

### 5.4 Boundaries

No boundary changes.

## 6. Phases

### Phase 1: Redeem codes

- **Goal:** UC-1 works end to end.
- **Depends on:** none
- **Changes:** OrderManager and PricingEngine.
- **Acceptance criteria:**
  - \`AC-1.1\` an integration test redeems a code and sees the reduced total.
- **Tests:** integration: redeem a code.
- **Status:** pending

## 7. Verification

### 7.1 Commands

\`\`\`
dotnet test
\`\`\`

### 7.2 Scenarios

1. **Redeem a code** (UC-1): enter a 10% code on a 50.00 cart; the total reads 45.00.

## 8. Risks, Assumptions and Open Questions

### Risks

- None known.

### Assumptions

- Codes are case-insensitive.

### Open Questions

- None.

## 9. Decision Log

No review round yet.
`

const OUT_OF_SCOPE = '**Out of scope**\n\n- Fixed-amount codes.\n\n'
const WITHOUT_OUT_OF_SCOPE = PLAN.replace(OUT_OF_SCOPE, '')
const WITHOUT_STATUS = PLAN.replace('- **Status:** pending\n', '')

// The engine resolves a read's path before it reaches the stub, with the
// platform's separators, so the stub's files are keyed by forward slashes.
const key = (path: string) => path.replace(/\\/g, '/')

// Stands for the engine beneath the plugin: the files on disk, which a Write
// replaces and an Edit changes, every tool call that gets through, recorded
// as run, and the Stop hooks answering as an unhooked session does.
const engine = (on: On, files: Record<string, string> = {}) => {
  const ran: string[] = []
  on('fs.read', ($, e) => {
    const text = files[key(e.path)]
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  on('tool.call', ($, e) => {
    ran.push(String(e.tool))
    if (e.tool === 'Write') files[key(e.file_path)] = e.content
    if (e.tool === 'Edit') files[key(e.file_path)] = (files[key(e.file_path)] ?? '').replace(e.old_string, e.new_string)
    return { result: undefined as never }
  })
  on('classic.Stop', () => ({}))
  on('classic.SubagentStop', () => ({}))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  return ran
}

const write = (file_path: string, content: string, agentId?: string) =>
  ({ tool: 'Write', file_path, content, ...(agentId === undefined ? {} : { agentId }) }) as const

const edit = (file_path: string, old_string: string, new_string: string, agentId?: string) =>
  ({ tool: 'Edit', file_path, old_string, new_string, ...(agentId === undefined ? {} : { agentId }) }) as const

const readOf = (file_path: string, agentId?: string) => ({ tool: 'Read', file_path, ...(agentId === undefined ? {} : { agentId }) }) as const

const context = (answer: ToolCallResult) => (answer.deny === undefined ? (answer.context ?? []).join('\n') : '')

const subagentStop = (agent_id: string) => ({
  agent_id,
  agent_type: 'devflow:plan-writer',
  agent_transcript_path: 'D:/transcripts/agent.jsonl',
  stop_hook_active: false,
})

describe('the plan test fixture', () => {
  test('is a sound plan', () => {
    expect(checkPlan(PLAN)).toEqual([])
  })
})

describe('writes', () => {
  test('a sound plan is written with nothing added to its result', async ($, on) => {
    const ran = engine(on)
    expect(context(await $.tool.call(write(PLAN_PATH, PLAN)))).toBe('')
    expect(ran).toEqual(['Write'])
  })

  test('a plan that breaks the contract is written, and its result names each problem as file:line', async ($, on) => {
    const ran = engine(on)
    const told = context(await $.tool.call(write(PLAN_PATH, WITHOUT_OUT_OF_SCOPE)))
    expect(ran).toEqual(['Write'])
    expect(told).toContain('devflow: your writes to this plan break its contract, references/feature-plan.md in the devflow plugin:')
    expect(told).toContain(`${PLAN_PATH}:11: §2 has no **Out of scope** list`)
  })

  test('an edit that breaks a sound plan is told what it broke', async ($, on) => {
    const files = { [PLAN_PATH]: PLAN }
    engine(on, files)
    const told = context(await $.tool.call(edit(PLAN_PATH, '- **Status:** pending\n', '')))
    expect(told).toMatch(/Phase 1 lacks `- \*\*Status:\*\*`/)
  })

  test('problems a plan had before the agent first wrote it are not its to fix', async ($, on) => {
    engine(on, { [PLAN_PATH]: WITHOUT_OUT_OF_SCOPE })
    expect(context(await $.tool.call(edit(PLAN_PATH, 'Codes are case-insensitive.', 'Codes are case-sensitive.')))).toBe('')
    expect(context(await $.tool.call(edit(PLAN_PATH, 'Codes are case-sensitive.', 'Codes ignore case.')))).toBe('')
  })

  test('files outside cc-docs/plans are not judged', async ($, on) => {
    engine(on)
    expect(context(await $.tool.call(write(OTHER_PATH, WITHOUT_OUT_OF_SCOPE)))).toBe('')
    expect(context(await $.tool.call(write('D:/Shop/cc-docs/plans/old/discount-codes.md', WITHOUT_OUT_OF_SCOPE)))).toBe('')
  })
})

describe('reads', () => {
  test('a read of a plan carries the check, whether it passes or not', async ($, on) => {
    engine(on, { [PLAN_PATH]: PLAN, 'D:/Shop/cc-docs/plans/broken.md': WITHOUT_STATUS })
    expect(context(await $.tool.call(readOf(PLAN_PATH)))).toBe(`devflow: the plan structure check (scripts/check-plan.mjs) passes ${PLAN_PATH}.`)
    const told = context(await $.tool.call(readOf('D:/Shop/cc-docs/plans/broken.md')))
    expect(told).toMatch(/finds 1 problem in this plan/)
    expect(told).toMatch(/broken\.md:\d+: Phase 1 lacks/)
  })

  test('a read of any other file is left alone', async ($, on) => {
    engine(on, { [OTHER_PATH]: WITHOUT_STATUS })
    expect(context(await $.tool.call(readOf(OTHER_PATH)))).toBe('')
  })
})

describe('handing back', () => {
  test('a subagent that hands back a plan it broke is sent back once, then let go', async ($, on) => {
    engine(on)
    await $.tool.call(write(PLAN_PATH, WITHOUT_OUT_OF_SCOPE, 'agent-1'))
    const first = await $.classic.SubagentStop(subagentStop('agent-1'))
    expect(first.block).toMatch(/devflow: your writes to this plan break its contract/)
    expect(first.block).toContain(`${PLAN_PATH}:11: §2 has no **Out of scope** list`)
    expect(first.block).toMatch(/this is asked once/)
    expect((await $.classic.SubagentStop(subagentStop('agent-1'))).block).toBeUndefined()
  })

  test('a subagent that fixed what it broke hands back freely', async ($, on) => {
    engine(on)
    await $.tool.call(write(PLAN_PATH, WITHOUT_STATUS, 'agent-1'))
    await $.tool.call(edit(PLAN_PATH, '- **Tests:** integration: redeem a code.\n', '- **Tests:** integration: redeem a code.\n- **Status:** pending\n', 'agent-1'))
    expect((await $.classic.SubagentStop(subagentStop('agent-1'))).block).toBeUndefined()
  })

  test('only the agent that broke a plan is sent back', async ($, on) => {
    engine(on)
    await $.tool.call(write(PLAN_PATH, WITHOUT_OUT_OF_SCOPE, 'agent-1'))
    expect((await $.classic.SubagentStop(subagentStop('agent-2'))).block).toBeUndefined()
    expect((await $.classic.Stop({ stop_hook_active: false })).block).toBeUndefined()
    expect((await $.classic.SubagentStop(subagentStop('agent-1'))).block).toMatch(/break its contract/)
  })

  test('an agent that broke two plans is told of both at once', async ($, on) => {
    engine(on)
    await $.tool.call(write(PLAN_PATH, WITHOUT_OUT_OF_SCOPE, 'agent-1'))
    await $.tool.call(write('D:/Shop/cc-docs/plans/gift-cards.md', WITHOUT_STATUS, 'agent-1'))
    const block = (await $.classic.SubagentStop(subagentStop('agent-1'))).block ?? ''
    expect(block).toMatch(/^devflow: your writes to these plans break its contract/)
    expect(block).toContain(`${PLAN_PATH}:11: §2 has no **Out of scope** list`)
    expect(block).toMatch(/gift-cards\.md:\d+: Phase 1 lacks/)
  })

  test('a plan an agent found broken and left as it was does not hold it back', async ($, on) => {
    engine(on, { [PLAN_PATH]: WITHOUT_OUT_OF_SCOPE })
    await $.tool.call(edit(PLAN_PATH, 'Codes are case-insensitive.', 'Codes ignore case.', 'agent-1'))
    expect((await $.classic.SubagentStop(subagentStop('agent-1'))).block).toBeUndefined()
  })

  test('the main conversation is sent back once at the end of its turn, unless it waits on background work', async ($, on) => {
    engine(on)
    await $.tool.call(write(PLAN_PATH, WITHOUT_STATUS))
    const waiting = [{ id: 'w1', type: 'local_workflow', status: 'running', description: 'review-plan' }] as never[]
    expect((await $.classic.Stop({ stop_hook_active: false, background_tasks: waiting })).block).toBeUndefined()
    expect((await $.classic.Stop({ stop_hook_active: false })).block).toMatch(/Phase 1 lacks/)
    expect((await $.classic.Stop({ stop_hook_active: false })).block).toBeUndefined()
  })

  test('a write refused beneath the hook leaves nothing to hand back', async ($, on) => {
    on('tool.call', () => ({ deny: 'refused by the person' }))
    on('classic.SubagentStop', () => ({}))
    expect((await $.tool.call(write(PLAN_PATH, WITHOUT_OUT_OF_SCOPE, 'agent-1'))).deny).toBe('refused by the person')
    expect((await $.classic.SubagentStop(subagentStop('agent-1'))).block).toBeUndefined()
  })
})
