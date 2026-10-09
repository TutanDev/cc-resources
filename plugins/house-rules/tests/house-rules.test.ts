import type { On, ToolCallResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

const EM_DASH = '\u2014'
const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

// Stands for the engine beneath the plugin: the files on disk, by name (the
// engine resolves a read's path before it reaches here), and every tool call
// that gets through, recorded as run.
const engine = (on: On, files: Record<string, string> = {}) => {
  const ran: string[] = []
  on('fs.read', ($, e) => {
    const text = files[e.path.split(/[\\/]/).pop() ?? '']
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  on('tool.call', ($, e) => {
    ran.push(e.tool)
    return { result: undefined as never }
  })
  return ran
}

const refusal = (answer: ToolCallResult) => answer.deny ?? (answer.isError ? answer.text : undefined)

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
    const added = { tool: 'Edit', file_path: 'a.md', old_string: 'a - b', new_string: `a ${EM_DASH} b` } as const
    const kept = { tool: 'Edit', file_path: 'a.md', old_string: `a ${EM_DASH} b`, new_string: `c ${EM_DASH} d` } as const
    expect(refusal(await $.tool.call(added))).toMatch(/em dash/)
    expect(refusal(await $.tool.call(kept))).toBeUndefined()
    expect(ran).toEqual(['Edit'])
  })

  test('a write is judged against the file it replaces', async ($, on) => {
    const ran = engine(on, { 'old.md': `x ${EM_DASH} y` })
    const fresh = { tool: 'Write', file_path: 'new.md', content: `x ${EM_DASH} y` } as const
    const rewrite = { tool: 'Write', file_path: 'old.md', content: `x ${EM_DASH} y, z` } as const
    expect(refusal(await $.tool.call(fresh))).toMatch(/em dash/)
    expect(refusal(await $.tool.call(rewrite))).toBeUndefined()
    expect(ran).toEqual(['Write'])
  })

  test('a shell command holding an em dash is refused, an escaped one runs', async ($, on) => {
    const ran = engine(on)
    const literal = { tool: 'Bash', command: `echo "a ${EM_DASH} b" > notes.md` } as const
    const escaped = { tool: 'Bash', command: "grep -rn $'\\u2014' docs" } as const
    expect(refusal(await $.tool.call(literal))).toMatch(/plain dash/)
    expect(refusal(await $.tool.call(escaped))).toBeUndefined()
    expect(ran).toEqual(['Bash'])
  })

  test('a Markdown edit that adds an em dash and a crowded line gives both reasons', async ($, on) => {
    engine(on, { 'doc.md': 'One sentence.\n' })
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
    const reason = refusal(await $.tool.call(write('post.md', '# Title\n\nThe frame is pure. Only the shell touches the GPU.\n')))
    expect(reason).toMatch(/more than one sentence on a line of post\.md/)
    expect(reason).toMatch(/The frame is pure\. Only the shell touches the GPU\./)
    expect(ran).toEqual([])
  })

  test('one sentence per line, and what Markdown cannot split or is no sentence, all run', async ($, on) => {
    const ran = engine(on)
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
    const join = { tool: 'Edit', file_path: 'plan.md', old_string: 'sentence.\nThe', new_string: 'sentence. The' } as const
    expect(refusal(await $.tool.call(join))).toMatch(/The first sentence\. The second sentence\./)
    expect(ran).toEqual([])
  })

  test('a typo fixed inside an old crowded line, or a rewrite that keeps it, runs', async ($, on) => {
    const legacy = 'Old line one. Old lien two.\nClean line.\n'
    const ran = engine(on, { 'legacy.md': legacy })
    const typo = { tool: 'Edit', file_path: 'legacy.md', old_string: 'lien', new_string: 'line' } as const
    expect(refusal(await $.tool.call(typo))).toBeUndefined()
    expect(refusal(await $.tool.call(write('legacy.md', `${legacy}Another clean line.\n`)))).toBeUndefined()
    expect(ran).toEqual(['Edit', 'Write'])
  })
})
