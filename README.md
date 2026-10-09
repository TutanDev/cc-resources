# cc-resources
Resources for Claude Code.

## Plugin Marketplace

This repository is a Claude Code plugin marketplace.
Add it once, then install the plugins you need:

```
/plugin marketplace add TutanDev/cc-resources
/plugin install dmf@cc-resources
```

| Plugin | Use it in | What it does |
|---|---|---|
| [`dmf`](plugins/dmf/README.md) | Any C# or Unity codebase | Domain Modeling Made Functional: domain discovery, type-driven modeling, Result-based workflow pipelines, DTOs and persistence, with DMF and functional-style reviewers |
| [`lowy`](plugins/lowy/README.md) | Larger systems with several subsystems | Löwy's Method: volatility-based decomposition, layered services, call chains, service wiring, verified multi-agent audits, and fitness tests; installs `dmf` as a dependency |
| [`house-rules`](plugins/house-rules/README.md) | Every session | Writing rules held at the tool call: no Claude attribution in commits or pull requests, no em dash, one sentence per line of Markdown |
| [`workstation`](plugins/workstation/README.md) | Every machine | Installs and enables `context7` and `serena` from Anthropic's official marketplace, and sets the cc-resources status line when user settings have none |

### Setting Up a Machine

```
claude plugin marketplace add anthropics/claude-plugins-official
claude plugin marketplace add TutanDev/cc-resources
claude plugin install workstation@cc-resources
claude plugin install dmf@cc-resources
claude plugin install house-rules@cc-resources
```

The first command is only needed before the machine's first interactive Claude Code session, which adds the official marketplace by itself.
Without it `workstation` fails to load, because its dependencies cannot be found.

### Choosing a Scope

`dmf`, `house-rules` and `workstation` are meant to be on everywhere, so install them at user scope (the default).
`lowy` is meant only for repositories that need system-level architecture.
Install it at project scope from inside such a repository, which records it in that repository's `.claude/settings.json` for the whole team:

```
claude plugin marketplace add TutanDev/cc-resources
claude plugin install lowy@cc-resources --scope project
```

Skip the first command if the marketplace is already added.
Installing `lowy` also installs and enables `dmf`.
On a machine that has not installed `lowy` yet, `/plugin` reports it as enabled in project settings but not installed; run the same commands there once.

## Maintaining

- `dmf` and `lowy` carry identical copies of three contracts: `project-profile.md`, `review-findings.md` and `design-directory.md`, under `plugins/<name>/references/`.
  An installed plugin cannot read another plugin's files, so edit one copy, copy it to the other plugin, and run `bash scripts/check-shared.sh`; CI runs the same check on every push.
- Run `claude plugin validate .` and `claude plugin validate plugins/<name>` before pushing.
- Run `claude plugin test plugins/house-rules` after changing its hooks.
- Run `bash plugins/workstation/tests/install-statusline.test.sh` after changing the `workstation` hook; CI runs it on every push.
- The status line script lives in `plugins/workstation/statusline-command.sh`, since an installed plugin can only ship files from its own folder.
- `workstation` may depend on `claude-plugins-official` only because `.claude-plugin/marketplace.json` lists it under `allowCrossMarketplaceDependenciesOn`; a dependency on any other marketplace needs an entry there too.
- Bump a plugin's `version` in its `.claude-plugin/plugin.json` with every change you want its users to receive.
