import type { On, ToolCallResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

const DOMAIN = 'D:/Game/Assets/Scripts/Orders/Order.cs'
const PIPELINE = 'D:/Game/Assets/Scripts/Orders/PlaceOrder.cs'

// Stands for the engine beneath the plugin: every tool call that gets
// through is recorded as run, every spawn starts an agent by the next id, and
// the prompt, the composed system prompt, the expanded skills, the session's
// end and the classic Stop hooks answer as an unhooked session does.
const engine = (on: On) => {
  const ran: string[] = []
  let spawned = 0
  on('tool.call', ($, e) => {
    ran.push(String(e.tool))
    return { result: undefined as never }
  })
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `agent-${(spawned += 1)}` }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('prompt.compose', () => ({ sections: [{ id: 'core', text: 'core', scope: 'shared' as const }] }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('classic.Stop', () => ({}))
  return ran
}

const refusal = (answer: ToolCallResult) => answer.deny ?? (answer.isError ? answer.text : undefined)

const edit = (file_path: string, agentId?: string) =>
  ({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b', ...(agentId === undefined ? {} : { agentId }) }) as const

const skill = (name: string, agentId?: string) =>
  ({ tool: 'Skill', skill: name, ...(agentId === undefined ? {} : { agentId }) }) as const

const spawn = (subagentType: string, extra: { fork?: boolean; parentAgentId?: string } = {}) => ({
  tool_use_id: 'toolu_1',
  prompt: 'Review the changed files.',
  description: 'Review changes',
  subagentType,
  provider: { plugin: 'dmf', tier: 'user' as const },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
  ...extra,
})

const stop = (extra: { background_tasks?: never[] } = {}) => ({ stop_hook_active: false, ...extra })

describe('implementation gate', () => {
  test('a C# edit is refused until an implementation skill is loaded, and names the skills', async ($, on) => {
    const ran = engine(on)
    const reason = refusal(await $.tool.call(edit(DOMAIN)))
    expect(reason).toMatch(/not loaded a dmf implementation skill/)
    expect(reason).toMatch(/dmf:domain-modeling/)
    expect(reason).toMatch(/dmf:workflow-implementation/)
    expect(reason).toMatch(/dmf:serialization-persistence/)
    expect(reason).toMatch(/Order\.cs/)
    expect(refusal(await $.tool.call(skill('dmf:domain-modeling')))).toBeUndefined()
    expect(refusal(await $.tool.call(edit(DOMAIN)))).toBeUndefined()
    expect(ran).toEqual(['Skill', 'Edit'])
  })

  test('domain discovery alone does not open the gate, the orchestrator does', async ($, on) => {
    engine(on)
    await $.tool.call(skill('dmf:domain-discovery'))
    expect(refusal(await $.tool.call(edit(DOMAIN)))).toMatch(/dmf implementation skill/)
    await $.tool.call(skill('dmf:orchestrator'))
    expect(refusal(await $.tool.call(edit(DOMAIN)))).toBeUndefined()
  })

  test('a skill typed as a command opens the gate for the main conversation', async ($, on) => {
    engine(on)
    await $.prompt.submit({
      text: '/dmf:workflow-implementation',
      wait: false,
      origin: { kind: 'composer' },
      command: { name: 'dmf:workflow-implementation', args: '' },
    })
    expect(refusal(await $.tool.call(edit(PIPELINE)))).toBeUndefined()
  })

  test('a subagent loads its own skill: the main conversation having one is not enough', async ($, on) => {
    engine(on)
    await $.tool.call(skill('dmf:workflow-implementation'))
    expect(refusal(await $.tool.call(edit(PIPELINE, 'agent-7')))).toMatch(/dmf implementation skill/)
    await $.tool.call(skill('dmf:workflow-implementation', 'agent-7'))
    expect(refusal(await $.tool.call(edit(PIPELINE, 'agent-7')))).toBeUndefined()
  })

  test("a fork carries its parent's skills, a fresh subagent does not", async ($, on) => {
    engine(on)
    await $.tool.call(skill('dmf:domain-modeling'))
    const fork = await $.agent.spawn(spawn('fork', { fork: true }))
    const fresh = await $.agent.spawn(spawn('general-purpose'))
    expect(refusal(await $.tool.call(edit(DOMAIN, fork.agentId)))).toBeUndefined()
    expect(refusal(await $.tool.call(edit(DOMAIN, fresh.agentId)))).toMatch(/dmf implementation skill/)
  })

  test('other files, generated C# and build output go through', async ($, on) => {
    const ran = engine(on)
    for (const path of ['D:/Game/README.md', 'D:/Game/Assets/Order.g.cs', 'D:/Game/obj/Debug/Order.cs', 'D:/Game/Order.csproj']) {
      expect(refusal(await $.tool.call(edit(path)))).toBeUndefined()
    }
    expect(ran).toEqual(['Edit', 'Edit', 'Edit', 'Edit'])
  })

  test('a write is held like an edit', async ($, on) => {
    engine(on)
    expect(refusal(await $.tool.call({ tool: 'Write', file_path: DOMAIN, content: 'class Order {}' }))).toMatch(/dmf/)
  })

  test('a shell command that writes C# is refused, one that reads it runs', async ($, on) => {
    const ran = engine(on)
    const writes = [
      `sed -i 's/Price/Amount/' Assets/Scripts/Orders/Order.cs`,
      `cat > "Assets/Scripts/Orders/Order.cs" <<'EOF'\nclass Order {}\nEOF`,
      `echo '// note' >> Order.cs`,
      `printf 'x' | tee Order.cs`,
    ]
    for (const command of writes) expect(refusal(await $.tool.call({ tool: 'Bash', command }))).toMatch(/dmf/)
    const powershell = `(Get-Content Order.cs) -replace 'Price','Amount' | Set-Content Order.cs`
    expect(refusal(await $.tool.call({ tool: 'PowerShell', command: powershell }))).toMatch(/dmf/)
    const reads = [`grep -n Price Order.cs`, `cat Order.cs > /tmp/order.txt`, `dotnet build 2>&1 | tee build.log`, `sed -n '1,20p' Order.cs`]
    for (const command of reads) expect(refusal(await $.tool.call({ tool: 'Bash', command }))).toBeUndefined()
    expect(ran).toEqual(['Bash', 'Bash', 'Bash', 'Bash'])
  })

  test("Serena's editing tools are held, its reading tools are not", async ($, on) => {
    engine(on)
    const replace = { tool: 'mcp__plugin_serena_serena__replace_symbol_body' as const, name_path: 'Order', relative_path: 'Assets/Order.cs', body: '' }
    const find = { tool: 'mcp__plugin_serena_serena__find_symbol' as const, name_path_pattern: 'Order', relative_path: 'Assets/Order.cs' }
    expect(refusal(await $.tool.call(replace))).toMatch(/dmf/)
    expect(refusal(await $.tool.call(find))).toBeUndefined()
  })

  test('a /clear unloads every skill', async ($, on) => {
    engine(on)
    await $.tool.call(skill('dmf:domain-modeling'))
    await $.tool.call(skill('dmf:workflow-implementation'))
    await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
    expect(refusal(await $.tool.call(edit(DOMAIN)))).toMatch(/dmf implementation skill/)
    await $.tool.call(skill('dmf:domain-modeling'))
    expect(refusal(await $.tool.call(write(PIPELINE, WORKFLOW)))).toMatch(/dmf:workflow-implementation/)
  })
})

const WORKFLOW = [
  'public static class PlaceOrder',
  '{',
  '    public static async Task<PlaceOrderOutcome> Run(IOrderStore store, UnvalidatedOrder order)',
  '    {',
  '        var outcome = Decide(await store.Find(order.Id));',
  '        return outcome;',
  '    }',
  '}',
].join('\n')

const TYPES = [
  'public abstract record PlaceOrderOutcome',
  '{',
  '    private PlaceOrderOutcome() { }',
  '    // Placed after the store, which is async, saved it.',
  '    public sealed record Placed(OrderId Id) : PlaceOrderOutcome;',
  '}',
  'public interface IOrderStore { Task<Order?> Find(OrderId id); }',
].join('\n')

const write = (file_path: string, content: string, agentId?: string) =>
  ({ tool: 'Write', file_path, content, ...(agentId === undefined ? {} : { agentId }) }) as const

describe('workflow gate', () => {
  test('code that awaits is refused until the agent loads the workflow skill, whatever else it loaded', async ($, on) => {
    const ran = engine(on)
    for (const name of ['dmf:domain-modeling', 'dmf:serialization-persistence', 'dmf:orchestrator']) await $.tool.call(skill(name))
    const reason = refusal(await $.tool.call(write(PIPELINE, WORKFLOW)))
    expect(reason).toMatch(/awaits/)
    expect(reason).toMatch(/dmf:workflow-implementation/)
    expect(reason).toMatch(/PlaceOrder\.cs/)
    await $.tool.call(skill('dmf:workflow-implementation'))
    expect(refusal(await $.tool.call(write(PIPELINE, WORKFLOW)))).toBeUndefined()
    expect(ran.filter(tool => tool === 'Write')).toEqual(['Write'])
  })

  test('an edit is judged by the text it adds', async ($, on) => {
    engine(on)
    await $.tool.call(skill('dmf:domain-modeling'))
    const awaiting = { tool: 'Edit', file_path: PIPELINE, old_string: 'Decide(order)', new_string: 'Decide(await store.Find(order.Id))' } as const
    const plain = { tool: 'Edit', file_path: PIPELINE, old_string: 'var total = 0;', new_string: 'var total = 1;' } as const
    expect(refusal(await $.tool.call(awaiting))).toMatch(/dmf:workflow-implementation/)
    expect(refusal(await $.tool.call(plain))).toBeUndefined()
  })

  test('types, contracts that return a Task, and the words in comments need only an implementation skill', async ($, on) => {
    engine(on)
    await $.tool.call(skill('dmf:domain-modeling'))
    expect(refusal(await $.tool.call(write(DOMAIN, TYPES)))).toBeUndefined()
  })

  test('the workflow skill typed as a command counts, and a fork carries it', async ($, on) => {
    engine(on)
    await $.prompt.submit({
      text: '/dmf:workflow-implementation',
      wait: false,
      origin: { kind: 'composer' },
      command: { name: 'dmf:workflow-implementation', args: '' },
    })
    expect(refusal(await $.tool.call(write(PIPELINE, WORKFLOW)))).toBeUndefined()
    const fork = await $.agent.spawn(spawn('fork', { fork: true }))
    const fresh = await $.agent.spawn(spawn('general-purpose'))
    expect(refusal(await $.tool.call(write(PIPELINE, WORKFLOW, fork.agentId)))).toBeUndefined()
    await $.tool.call(skill('dmf:domain-modeling', fresh.agentId))
    expect(refusal(await $.tool.call(write(PIPELINE, WORKFLOW, fresh.agentId)))).toMatch(/dmf:workflow-implementation/)
  })

  test("Serena's tools are judged by the code they write", async ($, on) => {
    engine(on)
    await $.tool.call(skill('dmf:domain-modeling'))
    const replace = { tool: 'mcp__plugin_serena_serena__replace_symbol_body' as const, name_path: 'PlaceOrder/Run', relative_path: 'Assets/PlaceOrder.cs', body: WORKFLOW }
    expect(refusal(await $.tool.call(replace))).toMatch(/dmf:workflow-implementation/)
  })
})

describe('review before the turn ends', () => {
  test('a turn that changed C# is sent back once with the files, then ends', async ($, on) => {
    engine(on)
    await $.tool.call(skill('dmf:domain-modeling'))
    await $.tool.call(edit(DOMAIN))
    await $.tool.call(edit(PIPELINE))
    const first = await $.classic.Stop(stop())
    expect(first.block).toMatch(/dmf:fp-reviewer/)
    expect(first.block).toMatch(/dmf:dmf-reviewer/)
    expect(first.block).toMatch(/Order\.cs/)
    expect(first.block).toMatch(/PlaceOrder\.cs/)
    expect((await $.classic.Stop({ stop_hook_active: true })).block).toBeUndefined()
    expect((await $.classic.Stop(stop())).block).toBeUndefined()
  })

  test('a turn that ran a dmf reviewer ends, fixes after the review included', async ($, on) => {
    engine(on)
    await $.tool.call(skill('dmf:domain-modeling'))
    await $.tool.call(edit(DOMAIN))
    await $.agent.spawn(spawn('dmf:fp-reviewer'))
    await $.tool.call(edit(DOMAIN))
    expect((await $.classic.Stop(stop())).block).toBeUndefined()
  })

  test('another reviewer does not count', async ($, on) => {
    engine(on)
    await $.tool.call(skill('dmf:domain-modeling'))
    await $.tool.call(edit(DOMAIN))
    await $.agent.spawn(spawn('general-purpose'))
    expect((await $.classic.Stop(stop())).block).toMatch(/dmf reviewer/)
  })

  test('a turn with no C# change ends', async ($, on) => {
    engine(on)
    await $.tool.call(edit('D:/Game/README.md'))
    expect((await $.classic.Stop(stop())).block).toBeUndefined()
  })

  test('a turn waiting on background work ends, and the next one is judged on all of it', async ($, on) => {
    engine(on)
    await $.tool.call(skill('dmf:domain-modeling'))
    await $.tool.call(edit(DOMAIN))
    const waiting = { background_tasks: [{ id: 'task-1' }] as never[] }
    expect((await $.classic.Stop(stop(waiting))).block).toBeUndefined()
    expect((await $.classic.Stop(stop())).block).toMatch(/Order\.cs/)
  })

  test('changes written by a subagent are reviewed when the main turn ends', async ($, on) => {
    engine(on)
    await $.tool.call(skill('dmf:workflow-implementation', 'agent-3'))
    await $.tool.call(edit(PIPELINE, 'agent-3'))
    expect((await $.classic.Stop(stop())).block).toMatch(/PlaceOrder\.cs/)
  })
})

describe('routing', () => {
  const compose = (tools: string[]) => ({
    model: 'claude-opus-5-5',
    promptModel: 'claude-opus-5-5',
    surfaces: ['terminal' as const],
    tools,
    outputStyle: null,
    traits: [],
  })

  test('the system prompt routes design, implementation and review to the skills', async ($, on) => {
    engine(on)
    const { sections } = await $.prompt.compose(compose(['Skill', 'Edit', 'Agent']))
    const routing = sections.find(section => section.id === 'dmf:routing')
    expect(routing?.scope).toBe('session')
    expect(routing?.text).toMatch(/dmf:domain-discovery/)
    expect(routing?.text).toMatch(/dmf:workflow-implementation/)
    expect(routing?.text).toMatch(/even when its types come with it/)
    expect(routing?.text).toMatch(/dmf:dmf-reviewer/)
    expect(sections[0]?.id).toBe('core')
  })

  test('an agent that cannot load skills is not told to', async ($, on) => {
    engine(on)
    const { sections } = await $.prompt.compose(compose(['Read', 'Grep', 'Glob']))
    expect(sections.map(section => section.id)).toEqual(['core'])
  })

  test('a code review runs both dmf reviewers, a simplify pass the functional one', async ($, on) => {
    engine(on)
    const review = await $.skill.prompt({ skill: 'code-review', text: 'Review the diff.' })
    expect(review.text).toMatch(/^Review the diff\./)
    expect(review.text).toMatch(/dmf:dmf-reviewer/)
    expect(review.text).toMatch(/dmf:fp-reviewer/)
    const simplify = await $.skill.prompt({ skill: 'simplify', text: 'Simplify the diff.' })
    expect(simplify.text).toMatch(/dmf:fp-reviewer/)
    expect(simplify.text).not.toMatch(/dmf:dmf-reviewer/)
    const other = await $.skill.prompt({ skill: 'security-review', text: 'Check it.' })
    expect(other.text).toBe('Check it.')
  })
})
