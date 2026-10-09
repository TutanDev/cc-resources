# house-rules

A Claude Code plugin that holds three writing rules at the tool call instead of leaving them to the model's memory.
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
  To search for or replace em dashes, spell the character as an escape: `$'\u2014'` in bash, `[char]0x2014` in PowerShell.

### One Sentence per Line

Every full sentence of Markdown (`.md`, `.mdx`, `.markdown`) sits on its own physical line.

- A Write or Edit is judged on the whole file as the change leaves it, and refused only when the file ends up with more crowded lines than it had.
  An old file that breaks the rule can still be edited, and a typo fixed inside an old crowded line goes through.
- The refusal names the lines to split.
- Front matter, fenced code, headings, table rows, HTML and reference definitions are not judged, because Markdown cannot split them.
- Abbreviations and initials (`e.g.`, `Dr.`, `J. R.`), ellipses and numbered titles (`**1. Stay raw.**`) end no sentence, and a one-word piece ("Landed.") is a fragment, not a sentence.

## Limits

- Files written through MCP tools, and Markdown written through a shell heredoc, are not checked.
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
