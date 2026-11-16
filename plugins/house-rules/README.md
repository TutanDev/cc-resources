# house-rules

A Claude Code plugin that holds eight rules at the tool call instead of leaving them to the model's memory, and carries three skills.
A rule written in `CLAUDE.md` loses whenever a system reminder or an old habit says otherwise.
A hook does not: the call is refused, and the refusal tells the model what to fix.
Two of the skills, `unslop` and `technical-writing`, cover what a hook cannot judge in prose, such as filler, hedging and AI vocabulary.
The third, `correct`, finds the mistakes agents keep repeating in a project and fixes each at the highest level that works, a hook like these among them.

It is built on function hooks, an early-access Claude Code API.
The first four rules were written and tested on Claude Code 2.1.294, and the other four on 2.1.325.

## Install

In Claude Code:

```
/plugin marketplace add TutanDev/cc-resources
/plugin install house-rules@cc-resources
```

Then run `/reload-plugins` or start a new session.

## Skills

| Skill | Role |
|---|---|
| `unslop` | Cuts AI tells from prose a person reads and gives it a voice: numbered patterns from AI vocabulary and filler to mannered prose and over-compression, and a section on adding soul |
| `technical-writing` | A layered standard for documentation, pull request descriptions and commit messages: Diátaxis modes, Google developer style sentences, Simplified Technical English instructions and Global English syntax |
| `correct` | Finds the corrections the person keeps repeating in a project, groups them into classes, and fixes each picked class at the highest level that works: architecture, types, a check whose error names the fix, a test, and docs last |

The model loads the two writing skills when it writes prose, and you can type either one, as `/house-rules:unslop` or `/house-rules:technical-writing`.
`unslop`'s rule numbers match those of the list it was ported from, so a removed rule leaves a gap.
Three rules differ from that list:

- Rule 14, against a colon in mid-sentence, is left out.
- Rule 13 allows a plain hyphen with a space on each side where a dash reads best, as the em dash rule below says.
- Rule 17 keeps the heading case a set of documents already uses, so a set in title case stays in title case.

`correct` runs only when you type `/house-rules:correct`.
It reads the project's recent commits, reverts and review comments, and what you said to agents in the project's own transcripts, through `scripts/list-corrections.mjs`.
It never reads another project's transcripts.
It proposes the classes it found, with their evidence and the level it would fix each at, and changes nothing until you pick.
Each check it adds must refuse a real past mistake before it counts as done.

All three skills adapt text from pstack, by Lauren Tan, under the MIT License, and [`NOTICE`](NOTICE) says which.

## Rule Table

These are the rules the plugin was built for, from its author's global `CLAUDE.md`, each paired with what holds it.
A rule nothing holds yet says so, and `correct` is how one gets an enforcer.

| Rule | Held by |
|---|---|
| No agent named as a co-author of a commit or a pull request | [No Claude Attribution](#no-claude-attribution) |
| No em dash; a plain dash takes its place | [No Em Dash](#no-em-dash), and `unslop` rule 13 |
| Each full sentence of Markdown on its own line | [One Sentence per Line](#one-sentence-per-line) |
| Changelog entries go under the next-version heading | [Changelog Under the Next Version](#changelog-under-the-next-version) |
| No version number bumped until the person says so | [No Bump Until Asked](#no-bump-until-asked) |
| No file marked as generated changed by hand | [Not by Hand](#not-by-hand) |
| Prefer quality, simplicity, robustness, scalability and maintainability over development cost | Nothing: a judgment call, held by `CLAUDE.md` alone |
| A bug fix starts by reproducing the bug end to end, as a user would meet it | Nothing yet; the `verification` plugin gives a project the skill to drive it |
| End-to-end testing is picky about the UI, down to the pixel | Nothing: a judgment call |
| Lint, test failures and flaky tests get fixed, even when unrelated | A project's CI, where it runs them; nothing in the session |

Two rules came from the plugin's own use rather than from `CLAUDE.md`: [No File Written from a Heredoc](#no-file-written-from-a-heredoc) and [Unslop Before Markdown](#unslop-before-markdown).

## The Rules

### No Claude Attribution

Commits and pull requests carry no Claude attribution.

- The commit trailer and the pull request footer that Claude Code asks the model to add are blanked at their source (`attribution.text`), so the reminder never asks.
- As a backstop, a `git commit` or `gh pr create|edit` run through Bash or PowerShell is refused when its message holds a `Co-Authored-By` trailer naming Claude or Anthropic, a "Generated with Claude Code" line, or the `Claude-Session:` link that a web or Remote Control session adds.
  Heredocs, PowerShell here-strings, separate `-m` messages, escaped `\n` and message files (`-F`, `--file`, `--body-file`) are all read.
- A command that searches for or strips an old trailer, such as `sed '/Co-Authored-By: Claude/d' | git commit --amend -F -`, still runs.
  So does a message whose sentence names the footer, since the footer counts only where a line or an option's quoted argument starts with it.

A project can turn the attribution off for every session, with this plugin or without it, in its `.claude/settings.json`:

```json
{ "attribution": { "commit": "", "pr": "", "sessionUrl": false } }
```

The hooks do not see a commit made outside a session, so a project that wants every commit held checks them in CI too, as this repository does with `scripts/check-attribution.mjs`.

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

### Unslop Before Markdown

An agent loads `unslop` before it writes Markdown (`.md`, `.mdx`, `.markdown`).

- A section of the main conversation's system prompt (`prompt.compose`) tells the model to load `unslop` before the first prose a person reads, and `technical-writing` as well for documentation, pull request descriptions and commit messages.
  A session with no Skill tool is told to read the skill's file instead, and one that cannot write files is told nothing.
- A subagent runs on its own definition's system prompt, so a note at the end of its task (`agent.spawn`) tells it to load `unslop`, or to read the skill's file if it has no Skill tool, as `devflow:plan-writer` does not.
  A fork already carries the main conversation's prompt, and its task gets no note.
- A Write or Edit of a Markdown file is refused until the agent making it has loaded `unslop`, and the refusal names the skill and its file.
  The other rules' reasons come with it, so one retry can fix them all.
- An agent loads the skill with the Skill tool, as a typed `/house-rules:unslop` (`prompt.submit`), or by reading its file.
  A load that fails counts for nothing.
- Each agent loads the skill for itself.
  A fork carries what its parent loaded (`agent.spawn`), and a `/clear` unloads it (`session.end`).

### Changelog Under the Next Version

An agent adds changelog entries under the next-version heading at the top, `## [Unreleased]` in Keep a Changelog, and nowhere else.

- A Write or Edit of a changelog (`CHANGELOG.md`, `changelog`, `Change-Log.txt` and the like) goes through when everything it changes lies in the next-version section: the heading, the lines under it down to the next heading as high, and its link definition.
  A heading titled `Unreleased`, `Next` or `Upcoming` counts, with or without brackets.
- An agent may open that heading when the changelog has none, and may write a new changelog that holds only its intro and that section.
- A change to the intro, a released section or its heading is refused, and the refusal says where entries go.
  It goes through when the person's latest prompt mentions the changelog.
- A shell command that writes to a changelog is refused and sent to Edit or Write, where the section it reaches can be told apart: a redirect or `tee` into it, or `sed -i`, `perl -i`, PowerShell's `Set-Content`, `Add-Content` or `Out-File`, or a script's write call such as `fs.writeFileSync` with the changelog named.
  It too goes through when the person's latest prompt mentions the changelog, so a tool can regenerate one when asked.

### No Bump Until Asked

A version number goes up only when the person says so.

- A change is refused when it adds a release heading to a changelog, or replaces the version in `package.json`, `plugin.json`, `marketplace.json`, `manifest.json`, an MSBuild project or props file (`<Version>`, `<PackageVersion>` and the like), a `.nuspec`, or Unity's `bundleVersion`.
  A version added with a new entry, or removed with an old one, is no bump, nor is a dependency's version.
- A command that bumps one is refused: `npm`, `pnpm` or `yarn version` with a new version, `npm pkg set version=`, or an in-place edit of one of those files with a version in the command, by `sed -i`, `perl -i`, PowerShell's file writers or a script's write call.
- The refusal says to leave the version, note the change under the changelog's next-version heading, and say in the reply that it is ready for a release.
- It all goes through when the person's latest prompt asks for a bump, a release, a new version or a version set to a number.
  A release opens the changelog's released sections too, since it moves the next-version entries under the new heading.
- Only the person's own prompts count: typed at the terminal, sent through Remote Control, or from an SDK host such as `claude -p`.
  A task notification, another session's message or a scheduled prompt neither asks nor clears what was asked, and a `/clear` clears it.

The rule came from a real mistake: an agent added a release to a Unity package's `CHANGELOG.md` by hand, em dashes and all, because the package's own `CLAUDE.md` asked for an entry and a version bump with each change.

It was proven end to end on Claude Code 2.1.325, in a scratch project whose `CLAUDE.md` asks for a release section and a minor bump with every change.
The user `CLAUDE.md` loaded beside it said the opposite: entries under `## [Unreleased]`, and no bump until asked.
Asked for a `--shout` flag, the agent's first command still ran `sed -i` on the version in `package.json` and wrote a release section into `CHANGELOG.md` with `node -e`.
The bump was refused, and the agent then put the entry under a new `## [Unreleased]` heading with Edit, left the version at 1.2.0, and said in its reply that the bump waits for the person.
That run showed the changelog write from the shell passing unseen, so such a command is now refused too, and in a second run the agent's shell write to the changelog was refused and made again with Edit.
Asked next to release 1.3.0, the agent moved the entry under a 1.3.0 heading and bumped `package.json`, and both went through.

### Not by Hand

A file marked as generated is not changed by hand.

- An Edit of a file marked as generated is refused.
  A marker is a comment among the file's first 10 lines that holds `<auto-generated>`, `@generated`, "generated" with "do not edit", a line that opens "Generated from" or "Generated by", or "this file was generated".
  The refusal quotes the marker and says to change what the file is generated from and run its generator.
- A Write of a whole generated file goes through, since that is how a skill such as `/lowy:fitness-tests` regenerates one from its template.
- A template (`.template`, `.tmpl`, `.hbs`, `.j2` and the like) carries the header of the file it makes, and is still edited by hand.
  So is a file of comments alone, such as the header a generator stamps on what it writes.
- This refusal, and the two before it, each come alone, since nothing else about the change matters until it goes another way.

Its markers were checked against every tracked file of the author's repositories, 2,811 of them: they mark the 140 generated files and nothing else.

## Limits

- Files written through MCP tools are not checked.
- Markdown written through a shell redirect other than a heredoc (`echo "..." > notes.md`) is not checked for the sentence rule.
- A heredoc or here-string first stored in a variable and written to a file later (`$text = @'...'@`, then `Set-Content notes.md $text`) is not caught, nor a file a program writes from its stdin.
- A citation with a quoted title (`"Title." *Venue*`) reads as two sentences.
- A message file the guard cannot read, such as a relative path after the shell changed directory, is judged on the command's text alone.
- The hooks check that an agent loaded `unslop`, not that its text follows the skill.
  A commit message, a pull request body or a reply is sent to the skills by the system prompt alone, and a Markdown file written through a shell command is not held to the load.
- A generated file changed by a shell command (`sed -i`, `echo >>`) is not seen, and a generated file whose marker is not in a comment among its first 10 lines is not known as one.
- A changelog changed by a command that does not name it, such as a script file or a `mv` over it, is not seen.
- A version bumped by a script file, by a release tool other than the package managers' version commands, or by a shell edit that does not name the file is not seen.
- A command is judged by its words, so one that names a version file and the word version beside a write call, such as reading the version into another file, is refused as a bump.
- What a prompt asks for is read from its words: "release notes" opens a bump as "release it" does, and "ship it" opens nothing.

## Layout

```
house-rules/
├── .claude-plugin/plugin.json
├── hooks/           The function hooks that hold the eight rules
├── skills/          unslop, technical-writing and correct
├── scripts/         The transcript reader correct runs, and its pure core
├── tests/           The hooks' tests, and the transcript reader's
├── types/           The session values the hooks keep, as a typed contract
└── NOTICE           The MIT notice for the text the skills adapt from pstack
```

## Developing

Run the tests and the validator from the repository root:

```
claude plugin test plugins/house-rules
claude plugin validate plugins/house-rules
node plugins/house-rules/tests/corrections.test.mjs
```

To try a change live, load the folder for one session with `claude --plugin-dir plugins/house-rules`; saving a file reloads the hooks.
Claude Code lays the API's types in `.claude-plugin/types/` when it loads the folder, and `tsconfig.json` extends them, so `tsc -p plugins/house-rules` type-checks the plugin.
