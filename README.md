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

### Choosing a Scope

`dmf` is meant to be on everywhere, so install it at user scope (the default).
`lowy` is meant only for repositories that need system-level architecture.
Install it at project scope from inside such a repository, which records it in that repository's `.claude/settings.json` for the whole team:

```
claude plugin install lowy@cc-resources --scope project
```

Installing `lowy` also installs and enables `dmf`.
On a machine that has not installed `lowy` yet, `/plugin` reports it as enabled in project settings but not installed; run the same command there once.

### Migrating from `lowy-dmf`

`lowy-dmf` was split into `dmf` and `lowy` in version 0.3.0.
Uninstall it, then install the plugins you need:

```
claude plugin uninstall lowy-dmf@cc-resources
claude plugin install lowy@cc-resources --scope project
```

Commands move to the new namespaces: `/lowy-dmf:arch-audit` is now `/lowy:arch-audit`, and the DMF skills drop their `dmf-` prefix (`/lowy-dmf:dmf-domain-modeling` is now `/dmf:domain-modeling`).
Design files in `.claude/docs/design/`, reviews in `.claude/docs/reviews/`, and the project profile `.claude/docs/architecture.md` keep working unchanged.

## Maintaining

- Both plugins carry identical copies of three contracts: `project-profile.md`, `review-findings.md` and `design-directory.md`, under `plugins/<name>/references/`.
  An installed plugin cannot read another plugin's files, so edit one copy, copy it to the other plugin, and run `bash scripts/check-shared.sh`; CI runs the same check on every push.
- Run `claude plugin validate .` and `claude plugin validate plugins/<name>` before pushing.
- Bump a plugin's `version` in its `.claude-plugin/plugin.json` with every change you want its users to receive.

## Other Resources

- `statusline-command.sh` - a status line script for Claude Code
