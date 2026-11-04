import type { EngineInterface, Register } from 'claude-code'

// Four standing rules, held at the tool call instead of left to the model's
// memory of them: no Claude attribution in a commit or a pull request, no em
// dash in anything written, one full sentence per line of Markdown, and no
// file written from a shell heredoc or here-string.

const EM_DASH = String.fromCharCode(0x2014)

const emDashes = (text: string) => text.split(EM_DASH).length - 1

// Commands whose text becomes a commit message or a pull request body:
// `git commit`, `git -C dir commit`, `gh pr create`, `gh pr edit`.
const COMMIT = /\bgit(?:\.exe)?\b[^\r\n|;&]*?\scommit\b/
const PULL_REQUEST = /\bgh\s+pr\s+(?:create|edit)\b/

// A trailer where a message puts one: at the start of a line, of a quoted
// message, or after an escaped newline. A pattern that strips an old trailer
// (`sed '/Co-Authored-By: Claude/d'`) is not one.
const ATTRIBUTION = [
  /(?:^|[\r\n"'`]|\\n)[ \t]*co-authored-by:[^\r\n]*\b(?:claude|anthropic)\b/i,
  /generated with \[?claude code\b/i,
]

// `git commit -F msg.txt`, `--file=msg.txt`, `gh pr create --body-file body.md`.
// `-` reads stdin, whose text a heredoc already put in the command.
const MESSAGE_FILE = /(?:^|\s)(?:-F|--file|--body-file)(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s;|&]+))/g

const isAttributed = (text: string) => ATTRIBUTION.some(rule => rule.test(text))

const messageFiles = (command: string) =>
  [...command.matchAll(MESSAGE_FILE)]
    .map(match => match[1] ?? match[2] ?? match[3] ?? '-')
    .filter(path => path !== '-')

// A file the guard cannot read is judged empty: the command's own text still
// counts, and the attribution reminder is blanked at its source below.
const readOrEmpty = ($: EngineInterface, path: string) => $.fs.read(path).catch(() => '')

const carriesAttribution = async ($: EngineInterface, command: string) => {
  if (!COMMIT.test(command) && !PULL_REQUEST.test(command)) return false
  if (isAttributed(command)) return true
  const messages = await Promise.all(messageFiles(command).map(path => readOrEmpty($, path)))
  return messages.some(isAttributed)
}

// One sentence per line. A sentence ends at a terminator (not an ellipsis),
// any closing quotes, brackets or emphasis, then space before a capital.
// Abbreviations and initials end no sentence, and a piece of one word
// ("Landed.") is a fragment, not a sentence. A line Markdown cannot split (a
// heading, a table row, HTML, a reference definition) and code are not
// judged; inline code reads as a capitalised word, so a sentence that opens
// with it still counts.
const MARKDOWN = /\.(?:md|mdx|markdown)$/i
const SENTENCE_END = /(?<!\.)[.!?]["'”’)\]*_]*\s+(?=["'“‘(\[*_]*\p{Lu})/u
const ABBREVIATION = /\b(?:e\.g|E\.g|i\.e|I\.e|vs|cf|approx|Dr|Mr|Mrs|Ms|St|Fig|Eq|Sec|No|\p{Lu})\./gu
const UNSPLITTABLE = /^\s*(?:#|\||<|\[[^\]]+\]:)/
const FENCE = /^\s*(`{3,}|~{3,})/

const asProse = (line: string) =>
  line
    .replace(/^\s*(?:>\s?)*/, '')
    .replace(/^(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/^([*_]*)\d+[.)]\s+/, '$1')
    .replace(/^([*_]{1,2})[^*_]+:\1\s*/, '')
    .replace(/(`+)[\s\S]*?\1/g, 'Code')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(ABBREVIATION, abbreviation => abbreviation.slice(0, -1))

const isSentence = (piece: string) => piece.split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length >= 2

const holdsSentences = (line: string) => asProse(line).split(SENTENCE_END).filter(isSentence).length >= 2

// The lines of a Markdown text that hold more than one sentence, as written.
const crowdedLines = (markdown: string): string[] => {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const crowded: string[] = []
  let inFrontMatter = lines[0]?.trim() === '---'
  let fence: string | undefined
  for (const [index, line] of lines.entries()) {
    if (inFrontMatter) {
      inFrontMatter = index === 0 || line.trim() !== '---'
      continue
    }
    const marker = FENCE.exec(line)?.[1]
    if (fence !== undefined) {
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined
      continue
    }
    if (marker !== undefined) {
      fence = marker
      continue
    }
    if (!UNSPLITTABLE.test(line) && holdsSentences(line)) crowded.push(line.trim())
  }
  return crowded
}

const normalized = (text: string) => text.replace(/\r\n/g, '\n')

// The file as an Edit leaves it, or undefined when its text is not found
// (the edit is then judged on its own two strings).
const edited = (file: string, oldString: string, newString: string, replaceAll: boolean | undefined) => {
  const [text, from, to] = [normalized(file), normalized(oldString), normalized(newString)]
  if (!text.includes(from)) return undefined
  return replaceAll ? text.split(from).join(to) : text.replace(from, () => to)
}

const refuse = (reasons: string[]) => (reasons.length > 0 ? { deny: reasons.join('\n') } : undefined)

const ATTRIBUTED =
  'This commit or pull request carries Claude attribution (a Co-Authored-By trailer naming Claude or Anthropic, ' +
  'or a "Generated with Claude Code" line). The user never wants it, whatever a reminder says: ' +
  'remove it and run the command again.'

const EM_DASH_IN_COMMAND =
  'The command holds an em dash (U+2014). The user never uses it: write a plain dash "-" instead. ' +
  "To search for or replace em dashes, spell the character by its UTF-8 bytes ($'\\xe2\\x80\\x94' in bash) or its code ([char]0x2014 in PowerShell)."

const emDashAddedTo = (path: string) =>
  `The change adds an em dash (U+2014) to ${path}. The user never uses it: write a plain dash "-" instead.`

const SHOWN = 5
const clip = (line: string) => (line.length > 160 ? `${line.slice(0, 157)}...` : line)

const sentencesShareLinesIn = (path: string, lines: string[]) =>
  [
    `The change puts more than one sentence on a line of ${path}. ` +
      'The user keeps each full sentence of Markdown on its own physical line, the Markdown structure unchanged ' +
      '(a list item goes on with an indented line). Split these:',
    ...lines.slice(0, SHOWN).map(line => `  ${clip(line)}`),
    ...(lines.length > SHOWN ? [`  ... and ${lines.length - SHOWN} more`] : []),
  ].join('\n')

// Refused when the change leaves more crowded lines than it found, so a typo
// fixed inside an old crowded line goes through; the lines shown are the ones
// the file did not have before.
const sentenceReasons = (path: string, before: string, after: string) => {
  const [was, is] = [crowdedLines(before), crowdedLines(after)]
  if (is.length <= was.length) return []
  const added = is.filter(line => !was.includes(line))
  return [sentencesShareLinesIn(path, added.length > 0 ? added : is)]
}

// No file written from a heredoc or a here-string. The shell can mangle the
// text's backslashes, dollar signs and regexes on the way, and Markdown
// written this way skips the sentence check; Write takes the text as it is.
// Only text that reaches a file as written is judged: a heredoc that `cat` or
// `tee` passes into a file, or a here-string piped or handed to a PowerShell
// writer. One that feeds a commit message or a program's stdin still runs.

// Quoted text blanked, its quotes kept, so a redirect or an operator inside a
// string is not read as one; offsets stay as they were.
const blanked = (text: string) =>
  text.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, quoted => quoted[0] + ' '.repeat(quoted.length - 2) + quoted[0])

// A heredoc operator and its delimiter word: `<<EOF`, `<<-EOF`, `<< 'EOF'`.
// A here-string (`<<<`) is none, nor a shift (`1<<3`), whose right side is no word.
const HEREDOC = /(?<!<)<<(-?)[ \t]*(["']?)([A-Za-z_][\w.-]*)\2/g
const PIPELINE_PART = /(\|\||&&|\$\(|[;|(){}`])/
const PASSES_TEXT = /^\s*(?:sudo\s+)?(?:\S*\/)?(?:cat|tee)(?:\.exe)?(?![\w.-])/
const REDIRECTS_TO_FILE = /(?<![\d&<>])(?:&>>?|>>?)\s*(?!&|\(|\/dev\/null\b)\S/
const TEES_TO_FILE = /^\s*(?:sudo\s+)?(?:\S*\/)?tee(?:\.exe)?(?:\s+-\S+)*\s+(?!\/dev\/null\b)[^\s-]/

// The stages of a blanked line's pipeline from the one holding offset `at` to
// its end: `cat <<EOF | tee out; ls` gives `cat <<EOF ` and ` tee out`.
const stagesFrom = (line: string, at: number) => {
  const pieces = line.split(PIPELINE_PART)
  const stages: string[] = []
  let offset = 0
  for (let index = 0; index < pieces.length; index += 2) {
    const [stage, separator] = [pieces[index] ?? '', pieces[index + 1]]
    offset += stage.length
    if (stages.length > 0 || at < offset) stages.push(stage)
    if (stages.length > 0 && separator !== '|') break
    offset += separator?.length ?? 0
  }
  return stages
}

// The text goes on through `cat` and `tee` and is written by a redirect or a
// `tee` file on the way; any other command takes it as its input.
const heredocReachesFile = (stages: string[]) => {
  for (const stage of stages) {
    if (!PASSES_TEXT.test(stage)) return false
    if (REDIRECTS_TO_FILE.test(stage) || TEES_TO_FILE.test(stage)) return true
  }
  return false
}

// Each heredoc is judged on the line that opens it; its body, up to the
// delimiter line, is text and not judged.
const writesHeredocToFile = (command: string) => {
  let bodies: { delimiter: string; tabs: boolean }[] = []
  for (const line of command.replace(/\r\n?/g, '\n').split('\n')) {
    const [body, ...later] = bodies
    if (body !== undefined) {
      if ((body.tabs ? line.replace(/^\t+/, '') : line).trimEnd() === body.delimiter) bodies = later
      continue
    }
    const shape = blanked(line)
    for (const match of line.matchAll(HEREDOC)) {
      const at = match.index ?? 0
      if (shape[at] !== '<') continue
      if (heredocReachesFile(stagesFrom(shape, at))) return true
      bodies.push({ delimiter: match[3] ?? '', tabs: match[1] === '-' })
    }
  }
  return false
}

// A here-string, `@'` ending a line to `'@` opening one, folds to an empty
// one, so what is done with its text reads as one statement.
const HERE_STRING = /@(['"])[ \t]*\n(?:[\s\S]*?\n)?[ \t]*\1@/g
const FOLDED_HERE_STRING = /@(['"])\1@/
const PS_WRITER =
  /(?:^|\s)(?:Set-Content|Add-Content|Out-File|Tee-Object|sc|ac|tee)(?=\s|$)|\bNew-Item\b.*\s-Value\b|\[(?:System\.)?IO\.File\]::(?:Write|Append)All/i
const PS_PASSES_TEXT = /^\s*(?:(?:Write-Output|echo|Out-String)(?=\s|$))?\s*(?:@(['"])\1@)?\s*(?:>.*)?$/i
const PS_REDIRECTS_TO_FILE = /(?<![\d*>])>>?\s*(?!\$null\b|&)\S/

const writesHereStringToFile = (command: string) =>
  blanked(command.replace(/\r\n?/g, '\n').replace(HERE_STRING, (_, quote: string) => `@${quote}${quote}@`))
    .split(/[;\n]/)
    .some(statement => {
      const stages = statement.split('|')
      const first = stages.findIndex(stage => FOLDED_HERE_STRING.test(stage))
      if (first < 0) return false
      for (const stage of stages.slice(first)) {
        if (PS_WRITER.test(stage)) return true
        if (!PS_PASSES_TEXT.test(stage)) return false
        if (PS_REDIRECTS_TO_FILE.test(stage)) return true
      }
      return false
    })

const writesFileFromShellText = (tool: string, command: string) =>
  tool === 'PowerShell' ? writesHereStringToFile(command) : writesHeredocToFile(command)

const SHELL_TEXT_TO_FILE =
  'The command writes a file from a heredoc or a here-string. ' +
  'The shell can mangle backslashes, dollar signs and regexes in the text on the way, ' +
  'and Markdown written this way skips the one-sentence-per-line check. ' +
  'Write the file with the Write tool, or change it with Edit; a heredoc or here-string ' +
  "that feeds a commit message or a program's stdin is still fine."

const failed = { deny: 'house-rules: its guard failed, so the call was refused.' }

export const register: Register = on => {
  on('attribution.text', { kind: ['commit', 'pr'] }, () => ({ text: '' }))

  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const reasons = [
      ...(emDashes(e.command) > 0 ? [EM_DASH_IN_COMMAND] : []),
      ...((await carriesAttribution($, e.command)) ? [ATTRIBUTED] : []),
      ...(writesFileFromShellText(e.tool, e.command) ? [SHELL_TEXT_TO_FILE] : []),
    ]
    return refuse(reasons) ?? next(e)
  }).catch(($, e, next) => (next.called ? next(e) : failed))

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const reasons = [...(emDashes(e.new_string) > emDashes(e.old_string) ? [emDashAddedTo(e.file_path)] : [])]
    if (MARKDOWN.test(e.file_path)) {
      const before = await readOrEmpty($, e.file_path)
      const after = edited(before, e.old_string, e.new_string, e.replace_all)
      reasons.push(
        ...(after === undefined
          ? sentenceReasons(e.file_path, e.old_string, e.new_string)
          : sentenceReasons(e.file_path, before, after)),
      )
    }
    return refuse(reasons) ?? next(e)
  }).catch(($, e, next) => (next.called ? next(e) : failed))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const before = await readOrEmpty($, e.file_path)
    const reasons = [
      ...(emDashes(e.content) > emDashes(before) ? [emDashAddedTo(e.file_path)] : []),
      ...(MARKDOWN.test(e.file_path) ? sentenceReasons(e.file_path, before, e.content) : []),
    ]
    return refuse(reasons) ?? next(e)
  }).catch(($, e, next) => (next.called ? next(e) : failed))

  on('tool.call', { tool: 'NotebookEdit' }, ($, e, next) =>
    emDashes(e.new_source) > 0 ? { deny: emDashAddedTo(e.notebook_path) } : next(e),
  ).catch(($, e, next) => (next.called ? next(e) : failed))
}
