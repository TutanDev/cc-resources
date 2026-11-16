import type { On, ToolCallResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const EM_DASH = '\u2014'
const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

// Stands for the engine beneath the plugin: the files on disk, by name (the
// engine resolves a read's path before it reaches here), every tool call that
// gets through, recorded as run (a skill load or a read is not recorded), every
// spawn starting an agent by the next id, its task recorded in `tasks`, and the
// prompt, the composed system prompt and the session's end answering as an
// unhooked session does.
const engine = (on: On, files: Record<string, string> = {}, tasks: string[] = []) => {
  const ran: string[] = []
  let spawned = 0
  on('fs.read', ($, e) => {
    const text = files[e.path.split(/[\\/]/).pop() ?? '']
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  on('tool.call', ($, e) => {
    if (e.tool !== 'Skill' && e.tool !== 'Read') ran.push(e.tool)
    return { result: undefined as never }
  })
  on('agent.spawn', ($, e) => {
    tasks.push(e.prompt)
    return { model: 'claude-opus-5-5', agentId: `agent-${(spawned += 1)}` }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('prompt.compose', () => ({ sections: [{ id: 'core', text: 'core', scope: 'shared' as const }] }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  return ran
}

const refusal = (answer: ToolCallResult) => answer.deny ?? (answer.isError ? answer.text : undefined)

// Loads the unslop skill, which a Markdown write needs first.
const unslop = ($: Engine, agentId?: string) =>
  $.tool.call({ tool: 'Skill', skill: 'house-rules:unslop', ...(agentId === undefined ? {} : { agentId }) })

describe('attribution', () => {
  test('the commit and pull request attribution texts are blanked at their source', async $ => {
    for (const kind of ['commit', 'pr'] as const) {
      const { text } = await $.attribution.text({ kind, text: `${TRAILER}` })
      expect(text).toBe('')
    }
  })

  test('a bash commit whose heredoc carries the trailer is refused', async ($, on) => {
    const ran = engine(on)
    const command = `git commit -m "$(cat <<'EOF'\nFix the thing\n\n${TRAILER}\nEOF\n)"`
    expect(refusal(await $.tool.call({ tool: 'Bash', command }))).toMatch(/Claude attribution/)
    expect(ran).toEqual([])
  })

  test('a PowerShell commit whose here-string carries the trailer is refused', async ($, on) => {
    const ran = engine(on)
    const command = `git -C "D:/Lab" commit -m @'\nFix the thing\n\n${TRAILER}\n'@`
    expect(refusal(await $.tool.call({ tool: 'PowerShell', command }))).toMatch(/Claude attribution/)
    expect(ran).toEqual([])
  })

  test('a commit message file carrying the trailer is refused, a clean one runs', async ($, on) => {
    const ran = engine(on, { 'dirty.txt': `Fix\n\n${TRAILER}\n`, 'clean.txt': 'Fix\n' })
    expect(refusal(await $.tool.call({ tool: 'Bash', command: 'git commit -F dirty.txt' }))).toMatch(/attribution/)
    expect(refusal(await $.tool.call({ tool: 'Bash', command: 'git commit --file=clean.txt' }))).toBeUndefined()
    expect(ran).toEqual(['Bash'])
  })

  test('a pull request body with the Claude Code footer is refused', async ($, on) => {
    const ran = engine(on)
    const command = 'gh pr create --title "Fix" --body "Fix\n\nGenerated with [Claude Code](https://claude.com/claude-code)"'
    expect(refusal(await $.tool.call({ tool: 'Bash', command }))).toMatch(/attribution/)
    expect(ran).toEqual([])
  })

  test('a trailer as its own -m or after an escaped newline is refused', async ($, on) => {
    const ran = engine(on)
    const separate = `git commit -m "Fix the thing" -m "${TRAILER}"`
    const escaped = `printf 'Fix\\n\\n${TRAILER}\\n' | git commit -F -`
    expect(refusal(await $.tool.call({ tool: 'Bash', command: separate }))).toMatch(/attribution/)
    expect(refusal(await $.tool.call({ tool: 'Bash', command: escaped }))).toMatch(/attribution/)
    expect(ran).toEqual([])
  })

  test('a clean commit, a search for old trailers and a commit that strips one all run', async ($, on) => {
    const ran = engine(on)
    const strip = "git log -1 --format=%B | sed '/Co-Authored-By: Claude/d' | git commit --amend -F -"
    expect(refusal(await $.tool.call({ tool: 'Bash', command: 'git commit -m "Fix the thing"' }))).toBeUndefined()
    expect(refusal(await $.tool.call({ tool: 'Bash', command: `git log --grep="${TRAILER}"` }))).toBeUndefined()
    expect(refusal(await $.tool.call({ tool: 'Bash', command: strip }))).toBeUndefined()
    expect(ran).toEqual(['Bash', 'Bash', 'Bash'])
  })
})

describe('em dash', () => {
  test('an edit that adds an em dash is refused, one that keeps an existing one runs', async ($, on) => {
    const ran = engine(on)
    await unslop($)
    const added = { tool: 'Edit', file_path: 'a.md', old_string: 'a - b', new_string: `a ${EM_DASH} b` } as const
    const kept = { tool: 'Edit', file_path: 'a.md', old_string: `a ${EM_DASH} b`, new_string: `c ${EM_DASH} d` } as const
    expect(refusal(await $.tool.call(added))).toMatch(/em dash/)
    expect(refusal(await $.tool.call(kept))).toBeUndefined()
    expect(ran).toEqual(['Edit'])
  })

  test('a write is judged against the file it replaces', async ($, on) => {
    const ran = engine(on, { 'old.md': `x ${EM_DASH} y` })
    await unslop($)
    const fresh = { tool: 'Write', file_path: 'new.md', content: `x ${EM_DASH} y` } as const
    const rewrite = { tool: 'Write', file_path: 'old.md', content: `x ${EM_DASH} y, z` } as const
    expect(refusal(await $.tool.call(fresh))).toMatch(/em dash/)
    expect(refusal(await $.tool.call(rewrite))).toBeUndefined()
    expect(ran).toEqual(['Write'])
  })

  test('a shell command holding an em dash is refused, an escaped one runs', async ($, on) => {
    const ran = engine(on)
    const literal = { tool: 'Bash', command: `echo "a ${EM_DASH} b" > notes.md` } as const
    const escaped = { tool: 'Bash', command: "grep -rn $'\\xe2\\x80\\x94' docs" } as const
    expect(refusal(await $.tool.call(literal))).toMatch(/plain dash/)
    expect(refusal(await $.tool.call(escaped))).toBeUndefined()
    expect(ran).toEqual(['Bash'])
  })

  test('a Markdown edit that adds an em dash and a crowded line gives both reasons', async ($, on) => {
    engine(on, { 'doc.md': 'One sentence.\n' })
    await unslop($)
    const edit = { tool: 'Edit', file_path: 'doc.md', old_string: 'One sentence.', new_string: `One ${EM_DASH} sentence. Two here.` } as const
    const reason = refusal(await $.tool.call(edit))
    expect(reason).toMatch(/em dash/)
    expect(reason).toMatch(/more than one sentence/)
  })

  test('both reasons are given at once', async ($, on) => {
    engine(on)
    const command = `git commit -m "Fix ${EM_DASH} thing\n\n${TRAILER}"`
    const reason = refusal(await $.tool.call({ tool: 'Bash', command }))
    expect(reason).toMatch(/em dash/)
    expect(reason).toMatch(/Claude attribution/)
  })
})

describe('one sentence per line', () => {
  const write = (file_path: string, content: string) => ({ tool: 'Write', file_path, content }) as const

  test('a new Markdown file with two sentences on a line is refused, and the line is named', async ($, on) => {
    const ran = engine(on)
    await unslop($)
    const reason = refusal(await $.tool.call(write('post.md', '# Title\n\nThe frame is pure. Only the shell touches the GPU.\n')))
    expect(reason).toMatch(/more than one sentence on a line of post\.md/)
    expect(reason).toMatch(/The frame is pure\. Only the shell touches the GPU\./)
    expect(ran).toEqual([])
  })

  test('one sentence per line, and what Markdown cannot split or is no sentence, all run', async ($, on) => {
    const ran = engine(on)
    await unslop($)
    const content = [
      '---',
      'description: Front matter. Not prose.',
      '---',
      '# A heading. With two parts.',
      '',
      'The frame is pure.',
      'Only the shell touches the GPU, e.g. Vulkan, cf. Silk.NET.',
      'Written by J. R. R. Tolkien and Dr. Smith.',
      'It trails off... But that is one line of thought.',
      '',
      '| Cell one. Cell two. |',
      '|---|',
      '',
      '```',
      'Code may. Hold anything.',
      '```',
      '',
      '**1. Stay raw, accept the duplication.**',
      '- **M8.2: Normal mapping. Landed.**',
      '**Status:** Accepted.',
      '',
    ].join('\n')
    expect(refusal(await $.tool.call(write('doc.md', content)))).toBeUndefined()
    expect(ran).toEqual(['Write'])
  })

  test('a sentence that opens with inline code or follows a list marker still counts', async ($, on) => {
    engine(on)
    await unslop($)
    expect(refusal(await $.tool.call(write('a.md', 'Run it once. `make` builds the rest.\n')))).toMatch(/sentence/)
    expect(refusal(await $.tool.call(write('b.md', '- **The pipeline is visible.** The editor draws it.\n')))).toMatch(/sentence/)
  })

  test('files that are not Markdown are not judged', async ($, on) => {
    const ran = engine(on)
    expect(refusal(await $.tool.call(write('Notes.cs', '// One. Two sentences here.\n')))).toBeUndefined()
    expect(ran).toEqual(['Write'])
  })

  test('an edit that joins two sentences onto one line is refused', async ($, on) => {
    const ran = engine(on, { 'plan.md': 'The first sentence.\nThe second sentence.\n' })
    await unslop($)
    const join = { tool: 'Edit', file_path: 'plan.md', old_string: 'sentence.\nThe', new_string: 'sentence. The' } as const
    expect(refusal(await $.tool.call(join))).toMatch(/The first sentence\. The second sentence\./)
    expect(ran).toEqual([])
  })

  test('a typo fixed inside an old crowded line, or a rewrite that keeps it, runs', async ($, on) => {
    const legacy = 'Old line one. Old lien two.\nClean line.\n'
    const ran = engine(on, { 'legacy.md': legacy })
    await unslop($)
    const typo = { tool: 'Edit', file_path: 'legacy.md', old_string: 'lien', new_string: 'line' } as const
    expect(refusal(await $.tool.call(typo))).toBeUndefined()
    expect(refusal(await $.tool.call(write('legacy.md', `${legacy}Another clean line.\n`)))).toBeUndefined()
    expect(ran).toEqual(['Edit', 'Write'])
  })
})

describe('no file written from a heredoc or here-string', () => {
  test('a heredoc that cat or tee passes into a file is refused', async ($, on) => {
    const ran = engine(on)
    const commands = [
      "cat > notes.md <<'EOF'\nOne line.\nEOF",
      'cat <<EOF >> log.txt\nline\nEOF',
      'cat>"$HOME/a b.md"<<EOF\nline\nEOF',
      "mkdir -p docs && cat > docs/match.py << 'PY'\nprint(re.match(r'\\d+', s))\nPY",
      "tee config.json <<'EOF' > /dev/null\n{}\nEOF",
      "cat <<'EOF' | tee -a out.txt\nx\nEOF",
      'sudo tee /etc/x.conf <<-EOF\n\tkey=1\n\tEOF',
    ]
    for (const command of commands) {
      expect(refusal(await $.tool.call({ tool: 'Bash', command }))).toMatch(/heredoc or a here-string/)
    }
    expect(ran).toEqual([])
  })

  test('a here-string piped or handed to a PowerShell writer is refused', async ($, on) => {
    const ran = engine(on)
    const commands = [
      "@'\nOne line.\n'@ | Set-Content -Path notes.md -Encoding utf8",
      'Set-Content -Path notes.md -Value @"\n$x\n"@',
      "[IO.File]::WriteAllText('a.txt', @'\nx\n'@)",
      "@'\nx\n'@ > a.txt",
      "@'\nx\n'@ | Out-String | Out-File a.txt -Encoding utf8",
    ]
    for (const command of commands) {
      expect(refusal(await $.tool.call({ tool: 'PowerShell', command }))).toMatch(/heredoc or a here-string/)
    }
    expect(ran).toEqual([])
  })

  test('a heredoc that feeds a commit, a program or the output runs', async ($, on) => {
    const ran = engine(on)
    const commands = [
      `git commit -m "$(cat <<'EOF'\nFix the > comparison\nEOF\n)"`,
      "python - <<'EOF' > result.json\nprint('{}')\nEOF",
      "cat <<'EOF' | git commit -F -\nFix\nEOF",
      "cat <<'EOF'\nshown, not written\nEOF",
      "cat <<'EOF' > /dev/null\nx\nEOF",
      'echo $((1<<3)) > bits.txt',
      "grep -c '<<EOF' notes.md > count.txt",
      "cat <<'OUTER'\ncat > nested.md <<'EOF'\nOUTER",
    ]
    for (const command of commands) expect(refusal(await $.tool.call({ tool: 'Bash', command }))).toBeUndefined()
    expect(ran).toEqual(commands.map(() => 'Bash'))
  })

  test('a here-string that feeds a commit, a program or a variable runs', async ($, on) => {
    const ran = engine(on)
    const commands = [
      "git commit -m @'\nFix the > comparison\n'@",
      "@'\nprint(1)\n'@ | python - > out.json",
      "$body = @'\nText\n'@\ngh pr create --title T --body $body",
      "Set-Content -Path a.txt -Value 'one line'",
    ]
    for (const command of commands) expect(refusal(await $.tool.call({ tool: 'PowerShell', command }))).toBeUndefined()
    expect(ran).toEqual(commands.map(() => 'PowerShell'))
  })
})

describe('writing skills', () => {
  const write = (file_path: string, agentId?: string) =>
    ({ tool: 'Write', file_path, content: 'One line.\n', ...(agentId === undefined ? {} : { agentId }) }) as const
  const edit = (file_path: string) => ({ tool: 'Edit', file_path, old_string: 'a', new_string: 'b' }) as const
  // The skill's file, as the refusal of an agent that has not loaded it names it.
  const skillFile = async ($: Engine) => {
    const named = /read (\S+) if you have no Skill tool/.exec(refusal(await $.tool.call(write('probe.md', 'agent-probe'))) ?? '')?.[1]
    expect(named).toMatch(/[\\/]house-rules[\\/]skills[\\/]unslop[\\/]SKILL\.md$/)
    return named ?? ''
  }
  const spawn = (subagentType: string, fork: boolean) => ({
    tool_use_id: 'toolu_1',
    prompt: 'Write the notes.',
    description: 'Write notes',
    subagentType,
    provider: { plugin: 'house-rules', tier: 'user' as const },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork,
  })
  const compose = (tools: string[]) => ({
    model: 'claude-opus-5-5',
    promptModel: 'claude-opus-5-5',
    surfaces: ['terminal' as const],
    tools,
    outputStyle: null,
    traits: [],
  })

  test('a Markdown write is refused until unslop is loaded, and the refusal names the skill and its file', async ($, on) => {
    const ran = engine(on, { 'notes.md': 'a\n' })
    const reason = refusal(await $.tool.call(write('notes.md')))
    expect(reason).toMatch(/writes Markdown to notes\.md, and this agent has not loaded the unslop skill yet/)
    expect(reason).toMatch(/house-rules:unslop/)
    expect(reason).toContain(await skillFile($))
    expect(refusal(await $.tool.call(edit('notes.md')))).toMatch(/not loaded the unslop skill/)
    await $.tool.call({ tool: 'Skill', skill: 'house-rules:technical-writing' })
    expect(refusal(await $.tool.call(write('notes.md')))).toMatch(/not loaded the unslop skill/)
    await unslop($)
    expect(refusal(await $.tool.call(write('notes.md')))).toBeUndefined()
    expect(refusal(await $.tool.call(edit('notes.md')))).toBeUndefined()
    expect(refusal(await $.tool.call(write('Notes.cs')))).toBeUndefined()
    expect(ran).toEqual(['Write', 'Edit', 'Write'])
  })

  test('a skill load that fails loads nothing', async ($, on) => {
    on('tool.call', { tool: 'Skill' }, () => ({ deny: 'Permission to use Skill was denied.' }))
    engine(on)
    expect(refusal(await unslop($))).toMatch(/denied/)
    expect(refusal(await $.tool.call(write('notes.md')))).toMatch(/not loaded the unslop skill/)
  })

  test('the refusal comes first, and the other rules still give their reasons', async ($, on) => {
    engine(on)
    const reason = refusal(await $.tool.call({ tool: 'Write', file_path: 'post.md', content: `One ${EM_DASH} two. Three here.\n` }))
    expect(reason).toMatch(/^house-rules: this call writes Markdown/)
    expect(reason).toMatch(/em dash/)
    expect(reason).toMatch(/more than one sentence/)
  })

  test("each agent loads it for itself, and a fork carries its parent's", async ($, on) => {
    engine(on)
    await unslop($)
    expect(refusal(await $.tool.call(write('notes.md', 'agent-7')))).toMatch(/not loaded the unslop skill/)
    const fork = await $.agent.spawn(spawn('fork', true))
    const fresh = await $.agent.spawn(spawn('general-purpose', false))
    expect(refusal(await $.tool.call(write('notes.md', fork.agentId)))).toBeUndefined()
    expect(refusal(await $.tool.call(write('notes.md', fresh.agentId)))).toMatch(/not loaded the unslop skill/)
    await unslop($, fresh.agentId)
    expect(refusal(await $.tool.call(write('notes.md', fresh.agentId)))).toBeUndefined()
  })

  test("a new subagent's task ends with the writing note, and a fork's is left alone", async ($, on) => {
    const tasks: string[] = []
    engine(on, {}, tasks)
    await $.agent.spawn(spawn('general-purpose', false))
    await $.agent.spawn(spawn('fork', true))
    expect(tasks[0]).toMatch(/^Write the notes\.\n\n# Writing\n\n/)
    expect(tasks[0]).toContain('`house-rules:unslop` with the Skill tool')
    expect(tasks[0]).toContain(`read ${await skillFile($)} if you have no Skill tool`)
    expect(tasks[1]).toBe('Write the notes.')
  })

  test('an agent with no Skill tool loads it by reading its file', async ($, on) => {
    engine(on)
    const writer = 'agent-3'
    await $.tool.call({ tool: 'Read', file_path: 'D:/Repo/README.md', agentId: writer })
    expect(refusal(await $.tool.call(write('plan.md', writer)))).toMatch(/not loaded the unslop skill/)
    await $.tool.call({ tool: 'Read', file_path: (await skillFile($)).replace(/\\/g, '/').toUpperCase(), agentId: writer })
    expect(refusal(await $.tool.call(write('plan.md', writer)))).toBeUndefined()
  })

  test('a typed /house-rules:unslop loads it for the main conversation, and a /clear unloads it', async ($, on) => {
    engine(on)
    await $.prompt.submit({ text: '/house-rules:unslop', wait: false, origin: { kind: 'composer' }, command: { name: 'house-rules:unslop', args: '' } })
    expect(refusal(await $.tool.call(write('notes.md')))).toBeUndefined()
    await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
    expect(refusal(await $.tool.call(write('notes.md')))).toMatch(/not loaded the unslop skill/)
  })

  test('the system prompt sends prose to the skills, or to the file for an agent that cannot load them', async ($, on) => {
    engine(on)
    const main = await $.prompt.compose(compose(['Skill', 'Edit', 'Agent']))
    const writing = main.sections.find(section => section.id === 'house-rules:writing')
    expect(writing?.scope).toBe('session')
    expect(writing?.text).toMatch(/house-rules:unslop/)
    expect(writing?.text).toMatch(/house-rules:technical-writing/)
    expect(main.sections[0]?.id).toBe('core')

    const writer = await $.prompt.compose(compose(['Read', 'Write', 'Edit']))
    const byFile = writer.sections.find(section => section.id === 'house-rules:writing')
    expect(byFile?.text).toContain(await skillFile($))
    expect(byFile?.text).not.toMatch(/Skill tool/)

    const reviewer = await $.prompt.compose(compose(['Read', 'Grep', 'Glob']))
    expect(reviewer.sections.map(section => section.id)).toEqual(['core'])
  })
})
