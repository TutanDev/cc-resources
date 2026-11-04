# house-rules

A Claude Code plugin that holds four writing rules at the tool call instead of leaving them to the model's memory.
A rule written in `CLAUDE.md` loses whenever a system reminder or an old habit says otherwise.
A hook does not: the call is refused, and the refusal tells the model what to fix.

It is built on function hooks, an early-access Claude Code API, and was written and tested on Claude Code 2.1.294.

## Install

In Claude Code:

```
/plugin marketplace add TutanDev/cc-resources
/plugin install house-rules@cc-resources
```

Then run `/reload-plugins` or start a new session.

## The Rules

### No Claude Attribution

Commits and pull requests carry no Claude attribution.

- The commit trailer and the pull request footer that Claude Code asks the model to add are blanked at their source (`attribution.text`), so the reminder never asks.
- As a backstop, a `git commit` or `gh pr create|edit` run through Bash or PowerShell is refused when its message holds a `Co-Authored-By` trailer naming Claude or Anthropic, or a "Generated with Claude Code" line.
  Heredocs, PowerShell here-strings, separate `-m` messages, escaped `\n` and message files (`-F`, `--file`, `--body-file`) are all read.
- A command that searches for or strips an old trailer, such as `sed '/Co-Authored-By: Claude/d' | git commit --amend -F -`, still runs.

### No Em Dash

Nothing written holds an em dash (U+2014); a plain dash takes its place.

- An Edit is refused when its new text has more em dashes than the text it replaces, and a Write when its content has more than the file it overwrites.
  A file that already holds some can still be edited.
- A NotebookEdit is refused for any em dash.
- A Bash or PowerShell command is refused for any literal em dash.
  To search for or replace em dashes, spell the character by its UTF-8 bytes in bash, `$'\xe2\x80\x94'`, or by its code in PowerShell, `[char]0x2014`.
  The `$'\u2014'` form is not safe: a tool call can decode it into the character before the hook sees the command.

### One Sentence per Line

Every full sentence of Markdown (`.md`, `.mdx`, `.markdown`) sits on its own physical line.

- A Write or Edit is judged on the whole file as the change leaves it, and refused only when the file ends up with more crowded lines than it had.
  An old file that breaks the rule can still be edited, and a typo fixed inside an old crowded line goes through.
- The refusal names the lines to split.
- Front matter, fenced code, headings, table rows, HTML and reference definitions are not judged, because Markdown cannot split them.
- Abbreviations and initials (`e.g.`, `Dr.`, `J. R.`), ellipses and numbered titles (`**1. Stay raw.**`) end no sentence, and a one-word piece ("Landed.") is a fragment, not a sentence.

### No File Written from a Heredoc

A file's text goes through the Write tool, not through a shell heredoc or here-string.
On the way through the shell, backslashes, dollar signs and regexes in the text can be mangled, and Markdown written that way would skip the sentence check above.

- A Bash command is refused when a heredoc's text reaches a file as written: `cat > notes.md <<'EOF'`, `cat <<EOF >> log.txt`, `tee config.json <<EOF`, or `cat <<EOF | tee -a out.txt`.
- A PowerShell command is refused when a here-string is piped or handed to a writer: `@'...'@ | Set-Content`, `Set-Content -Value @'...'@`, `Out-File`, `Add-Content`, `Tee-Object`, `New-Item -Value`, `[IO.File]::WriteAllText`, or a `>` redirect of the here-string itself.
- A heredoc or here-string that feeds anything else still runs: a commit message (`git commit -m "$(cat <<'EOF'...`, `git commit -F -`), a program's stdin (`python - <<'EOF' > result.json`), a variable, or the output.
- A heredoc's body is text, so an example command inside it is not judged.

## Limits

- Files written through MCP tools are not checked.
- Markdown written through a shell redirect other than a heredoc (`echo "..." > notes.md`) is not checked for the sentence rule.
- A heredoc or here-string first stored in a variable and written to a file later (`$text = @'...'@`, then `Set-Content notes.md $text`) is not caught, nor a file a program writes from its stdin.
- A citation with a quoted title (`"Title." *Venue*`) reads as two sentences.
- A message file the guard cannot read, such as a relative path after the shell changed directory, is judged on the command's text alone.

## Developing

Run the tests and the validator from the repository root:

```
claude plugin test plugins/house-rules
claude plugin validate plugins/house-rules
```

To try a change live, load the folder for one session with `claude --plugin-dir plugins/house-rules`; saving a file reloads the hooks.
Claude Code lays the API's types in `.claude-plugin/types/` when it loads the folder, and `tsconfig.json` extends them, so `tsc -p plugins/house-rules` type-checks the plugin.
