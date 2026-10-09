# cc-resources

TutanDev's Claude Code plugin marketplace.
It holds four plugins: two for designing C# and Unity code, one that enforces writing rules, and one that sets up a machine.

## Plugin Index

| Plugin | What it does | Contents | Depends on |
|---|---|---|---|
| [`dmf`](plugins/dmf/README.md) | Domain Modeling Made Functional in C#: domain discovery, type-driven modeling, Result-based workflow pipelines, DTOs and persistence, with DMF and functional-style reviewers | 5 skills, 2 agents | Nothing |
| [`lowy`](plugins/lowy/README.md) | Löwy's Method for larger systems: volatility-based decomposition, layered services, call chains, service wiring, verified multi-agent audits, and architecture fitness tests | 10 skills, 2 agents, 2 workflows | `dmf` |
| [`house-rules`](plugins/house-rules/README.md) | Writing rules held at the tool call: no Claude attribution in commits or pull requests, no em dash, one sentence per line of Markdown | Function hooks on `Bash`, `PowerShell`, `Edit`, `Write` and `NotebookEdit` calls, and on the commit and pull request attribution text | Nothing |
| [`workstation`](plugins/workstation/README.md) | The setup for every machine: installs and enables `context7` and `serena`, and sets the cc-resources status line when user settings have none | A `SessionStart` hook and the status line script | `context7` and `serena` from `claude-plugins-official` |

Each plugin's README lists its skills, agents and workflows, and how to call them.

## How to Use This Marketplace

### Add It

Add the marketplace once per machine:

```
claude plugin marketplace add TutanDev/cc-resources
```

Inside a session, the same command is `/plugin marketplace add TutanDev/cc-resources`, and `/plugin` opens a menu for everything below.

### Install Plugins

```
claude plugin install <plugin>@cc-resources
```

A plugin's dependencies are installed and enabled with it, at the same scope.
A new install loads at the next session start, or in the current session after `/reload-plugins`.

### Set Up a New Machine

```
claude plugin marketplace add anthropics/claude-plugins-official
claude plugin marketplace add TutanDev/cc-resources
claude plugin install workstation@cc-resources
claude plugin install dmf@cc-resources
claude plugin install house-rules@cc-resources
```

The first command is only needed before the machine's first interactive Claude Code session, which adds the official marketplace by itself.
Without it `workstation` fails to load, because its dependencies cannot be found.

### Manage Installed Plugins

| To | Run |
|---|---|
| See what is installed and whether it loaded | `claude plugin list` |
| Install a plugin for one repository and everyone who works in it | `claude plugin install <plugin>@cc-resources --scope project` |
| Get new versions | `claude plugin marketplace update cc-resources`, then `claude plugin update <plugin>@cc-resources` and restart Claude Code |
| Turn a plugin off without removing it | `claude plugin disable <plugin>@cc-resources` |
| Remove a plugin and the dependencies nothing else needs | `claude plugin uninstall <plugin>@cc-resources --prune` |

## External Dependencies

Everything a plugin needs beyond this repository, and who needs it.

### Claude Code Features

| Dependency | Needed by | Notes |
|---|---|---|
| Plugin dependencies | `lowy`, `workstation` | `workstation` depends on another marketplace, which `.claude-plugin/marketplace.json` allows under `allowCrossMarketplaceDependenciesOn` |
| Function hooks | `house-rules` | An early-access API; the plugin was written and tested on Claude Code 2.1.294 |
| The Workflow tool | `lowy`'s `arch-audit` and `design-check` | Where a plan has it off, add `"enableWorkflows": true` to settings; without it the routers run the same agents directly, without the verification pass |

### Plugins and Marketplaces

| Dependency | Needed by | Notes |
|---|---|---|
| `dmf@cc-resources` | `lowy` | Installed with `lowy` |
| The `claude-plugins-official` marketplace | `workstation` | Added by the first interactive session, or by `claude plugin marketplace add anthropics/claude-plugins-official` |
| `context7@claude-plugins-official` | `workstation` | Installed with `workstation` |
| `serena@claude-plugins-official` | `workstation` | Installed with `workstation` |

### Tools and Services on the Machine

| Dependency | Needed by | Notes |
|---|---|---|
| `bash` and `jq` | `workstation`'s hook and status line | On Windows, Git Bash; without `jq` the hook only warns |
| `uv` (`uvx`), `git` and access to GitHub | `serena` | Its MCP server starts with `uvx --from git+https://github.com/oraios/serena serena start-mcp-server` |
| Access to `mcp.context7.com` | `context7` | A hosted MCP server; Context7 may ask you to authenticate |

### In Your Project

| Dependency | Needed by | Notes |
|---|---|---|
| A C# functional library | `dmf`, `lowy` | Examples use Tutan.Functional (`com.tutan.functional`); name yours in `.claude/docs/architecture.md` and the skills translate to it |
| Unity Test Framework (`com.unity.test-framework`) | `lowy`'s `fitness-tests` | The generated tests are EditMode NUnit tests |
| Mono.Cecil (`com.unity.nuget.mono-cecil`) | `lowy`'s `fitness-tests` | The skill asks before adding it; 1.11.6 works with Unity 6.3; outside Unity, the `Mono.Cecil` NuGet package |
| A Mermaid renderer | `lowy`'s `generate-diagram` and `call-chain-validator` | Optional: diagrams are written as Mermaid text, which GitHub renders |

### For Maintaining This Repository

| Dependency | Used for |
|---|---|
| The Claude Code CLI | `claude plugin validate` and `claude plugin test plugins/house-rules` |
| .NET 8 SDK or later | `dotnet test plugins/lowy/tests/fitness`, which restores Mono.Cecil 0.11.5, NUnit 4.6.1, NUnit3TestAdapter 6.3.0 and Microsoft.NET.Test.Sdk 18.10.1 from NuGet |
| `bash`, `diff` and `jq` | `scripts/check-shared.sh` and `plugins/workstation/tests/install-statusline.test.sh` |
| TypeScript (`tsc`) | Optional: type-checking `house-rules` with `tsc -p plugins/house-rules` |
| GitHub Actions | CI on every push: the shared-contract check and the `workstation` hook tests on `ubuntu-latest`, and the LF checkout check on `windows-latest` |

## Maintaining

- `dmf` and `lowy` carry identical copies of three contracts: `project-profile.md`, `review-findings.md` and `design-directory.md`, under `plugins/<name>/references/`.
  An installed plugin cannot read another plugin's files, so edit one copy, copy it to the other plugin, and run `bash scripts/check-shared.sh`; CI runs the same check on every push.
- Run `claude plugin validate .` and `claude plugin validate plugins/<name>` before pushing.
- Run `claude plugin test plugins/house-rules` after changing its hooks.
- Run `bash plugins/workstation/tests/install-statusline.test.sh` after changing the `workstation` hook; CI runs it on every push.
- Run `dotnet test plugins/lowy/tests/fitness` after changing anything under `plugins/lowy/skills/fitness-tests/templates/`.
- The status line script lives in `plugins/workstation/statusline-command.sh`, since an installed plugin can only ship files from its own folder.
- A dependency on a plugin from another marketplace needs that marketplace listed under `allowCrossMarketplaceDependenciesOn` in `.claude-plugin/marketplace.json`.
- Bump a plugin's `version` in its `.claude-plugin/plugin.json` with every change you want its users to receive.
- Keep the [Plugin Index](#plugin-index) and [External Dependencies](#external-dependencies) in step with the plugins.
