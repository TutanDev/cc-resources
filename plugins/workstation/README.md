# workstation

A Claude Code plugin that holds the setup every machine gets.
Installing it installs and enables two plugins from Anthropic's official marketplace, sets up the cc-resources status line, and allows the reads and writes the cc-resources workflows need.

| Part | How it gets there |
|---|---|
| [`context7`](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/context7) | A dependency in `plugin.json`, installed and enabled at the same scope as `workstation` |
| [`serena`](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/serena) | The same |
| The status line | A `SessionStart` hook that writes `statusLine` into your user settings when they have none |
| The workflow permissions | The same hook, which adds two rules to `permissions.allow` in your user settings, once each |

## Install

```
claude plugin marketplace add anthropics/claude-plugins-official
claude plugin marketplace add TutanDev/cc-resources
claude plugin install workstation@cc-resources
```

The first command is only needed on a machine that has never started an interactive Claude Code session, since that first session adds the official marketplace by itself.
Running it again does nothing.

## How It Works

### The Two Dependencies

`plugin.json` names `context7@claude-plugins-official` and `serena@claude-plugins-official` as dependencies.
A plugin may depend on another marketplace only when its own marketplace allows that one, so `.claude-plugin/marketplace.json` at the repository root lists `claude-plugins-official` under `allowCrossMarketplaceDependenciesOn`.

Claude Code installs them marked as automatic.
`claude plugin uninstall workstation@cc-resources --prune` removes them with it, unless you also installed one yourself or another plugin still needs it.

### The Hook

A plugin cannot set the status line or permission rules itself: a plugin's own `settings.json` takes only `agent` and `subagentStatusLine`, and Claude Code drops every other key.
So a `SessionStart` hook, `hooks/setup-user-settings.sh`, writes them into your user settings instead, at every session start.
It makes every change in one write, because Claude Code runs a session's hooks in parallel and two writers could lose each other's changes.
It says what it changed in one message, and nothing when there is nothing to change.
Claude Code reloads settings when they change, so what the hook adds applies to the session it runs in.
`CLAUDE_CONFIG_DIR` is honored in place of `~/.claude`.

### The Status Line

1. The hook copies `statusline-command.sh` to `~/.claude/workstation/statusline-command.sh` whenever the plugin's copy differs, so a plugin update reaches the status line at the next session start.
2. When `~/.claude/settings.json` has no `statusLine`, it adds one that runs that copy.

The settings name the copy rather than the plugin's own folder, because that folder changes with every version and Claude Code removes old ones after an update.

### The Workflow Permissions

The `lowy` and `devflow` workflows run their agents in the background, where Claude Code cannot ask you to approve a read or a write, so it refuses any that no permission covers.
The hook adds the two rules they need to `permissions.allow` in your user settings:

| Rule | Allows |
|---|---|
| `Read(~/.claude/plugins/**)` | Reading the installed plugins' files, such as the reference files the reviewers follow |
| `Edit(//**/cc-docs/**)` | Writing under any `cc-docs/` folder, where the workflows keep plans and reports |

It adds each rule once, and records it in `~/.claude/workstation/allow-rules-added`, so a rule you remove stays removed.
A rule already in `permissions.allow` is recorded without being added again.
With `CLAUDE_CONFIG_DIR` outside your home folder, the `Read` rule names that folder's `plugins/` by its absolute path, in the form Claude Code matches against: `C:\x` is `//c/x`.

## Limits

- A `statusLine` already in your user settings is never changed, whatever it runs.
  To switch a machine to this one, delete its `statusLine` and start a new session.
- A rule you remove from `permissions.allow` is never added again.
  To get it back, add it by hand, or delete its line from `~/.claude/workstation/allow-rules-added` and start a new session.
- The hook and the status line need `bash` and `jq`; on Windows, Git Bash.
  Without `jq` the hook only warns.
- A `settings.json` that is not a JSON object is left alone, with a warning at every session start until it is fixed.
  So is a `permissions.allow` that is not a list, though the status line is still set.
- A symlinked `settings.json` is written through, so the link survives; a plain one is replaced by a rename.
- If the official marketplace is missing, `workstation` fails to load, so its hook does not run either.
  Add the marketplace, then run `claude plugin install workstation@cc-resources` again: adding it alone may install only one of the two dependencies.
- Cloud sessions never add the official marketplace, so `workstation` does not load there unless the environment adds it.

## Developing

Run the hook's tests from the repository root:

```
bash plugins/workstation/tests/setup-user-settings.test.sh
```

They run the hook against throwaway config directories and never touch your own settings.
Where Git Bash cannot make symlinks, the two cases that need them are skipped; CI runs them on Linux.
Bump `version` in `.claude-plugin/plugin.json` with every change to the hook or to `statusline-command.sh` you want your machines to receive.
