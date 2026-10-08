# lowy

A Claude Code plugin for **Löwy's Method** (Juval Löwy, *Righting Software*) on larger systems: volatility-based decomposition, layered services, Design Don'ts, call chains, and service wiring.
It interleaves the method with **Domain Modeling Made Functional** (Scott Wlaschin) in one 8-phase design pipeline: Löwy draws the service boundaries, DMF models what lives inside them.

The DMF half is the [`dmf`](../dmf/README.md) plugin, which this plugin declares as a dependency and installs with it.
Use `dmf` alone in codebases that do not need system-level architecture.

It is tuned for C#/Unity work, with XR-specific adaptations.

## Install

From inside the repository that needs it:

```
claude plugin marketplace add TutanDev/cc-resources
claude plugin install lowy@cc-resources --scope project
```

Project scope records the plugin in that repository's `.claude/settings.json`, so it is on for the whole team and off in your other repositories.
Installing `lowy` also installs and enables `dmf`.
Then run `/reload-plugins` or start a new session.

## Skills

Skills are namespaced under the plugin: type `/lowy:<skill>`, or describe what you want and Claude picks the right skill.

| Skill | Role |
|---|---|
| `architecture-advisor` | Entry point: interleaves both methods across the 8 phases below |
| `lowys-method` | Löwy orchestrator: routes to the Löwy phase skills |
| `list-volatilities` | Phase 2: core use cases, axes of volatility, candidate services |
| `classify-structure` | Phase 3: layers, naming, Design Don'ts, ratios |
| `validate-use-cases` | Phase 5: call chains for every core use case |
| `wire-services` | Phase 7: direct, queued, pub/sub, or Message Bus |
| `generate-diagram` | Mermaid layer, call chain, and sequence diagrams |
| `system-decomposer` | Composite: full Löwy pipeline with checkpoints |
| `arch-reviewer` | Composite: interactive review of existing code or a design, with a scorecard |
| `fitness-tests` | Generates Unity EditMode tests that fail on new violations of the mechanical Löwy rules |

Phases 1, 4, 6 and 8 are skills of the `dmf` plugin: `dmf:domain-discovery`, `dmf:domain-modeling`, `dmf:workflow-implementation` and `dmf:serialization-persistence`, with `dmf:orchestrator` as their router.

## Agents

Read-only reviewers that run in their own context and return findings with `file:line` evidence.
Claude delegates to them from the skills and workflows, or when you ask for a review.

| Agent | Checks |
|---|---|
| `lowy:lowy-reviewer` | Service inventory from the code, layers, naming, the 12 Design Don'ts, closed architecture, ratios, smells |
| `lowy:call-chain-validator` | Each use case traced hop by hop through a design or the code, with a verdict per chain |

The workflows below also run the `dmf` plugin's reviewers: `dmf:dmf-reviewer` (domain types, illegal states, workflows, error unions, DTOs) and `dmf:fp-reviewer` (functional style).

## Workflows

Multi-agent runs that fan out reviewers in parallel, try to refute every finding against the code, and write one report.

| Workflow | Use |
|---|---|
| `/lowy:arch-audit <path> [--thorough] [--lenses=lowy,chains,dmf,fp]` | Audit existing code with every lens, per subsystem |
| `/lowy:design-check <topic> [--thorough]` | Check a design directory before implementing it: call chains, Don'ts, a change simulation per volatility axis, the domain model, staleness |

`--thorough` verifies each finding with three independent skeptics instead of one.
`--out=<folder>` writes the report somewhere other than `.claude/docs/reviews/`.

Workflows need the Workflow tool; where your plan has it off by default, add `"enableWorkflows": true` to your settings.
Without it, the routers run the same agents directly, without the verification pass.
In `claude -p` (scripts, CI), allow the `Workflow` tool and set `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`: workflows run in the background, and a print session otherwise stops them 10 minutes after its last turn.

## Quick Start

| You want to... | Say |
|---|---|
| Design a new system end-to-end | "Help me architect this system: ..." |
| Decompose into services only | `/lowy:system-decomposer <requirements>` |
| Review existing code with you in the loop | `/lowy:arch-reviewer <path>` |
| Audit a codebase in one run | `/lowy:arch-audit <path>` |
| Check a finished design | `/lowy:design-check <topic>` |
| Stop violations from coming back | `/lowy:fitness-tests` |
| Check one design question | "Is this a Manager or an Engine?", "Draw the call chain for checkout" |
| Model types for a known service | "Model the domain types for the pricing service" (runs `dmf:domain-modeling`) |

## How It Works

Each phase writes a numbered file to `.claude/docs/design/<topic>/` in your project, and later phases read the earlier files:

```
01-domain-discovery.md       Phase 1: Understand the domain (DMF)
02-volatilities.md           Phase 2: Decompose by volatility (Löwy)
03-layered-architecture.md   Phase 3: Classify into layers (Löwy)
04-domain-model.md           Phase 4: Model types per service (DMF)
05-call-chains.md            Phase 5: Validate with call chains (Löwy)
06-workflow-pipelines.md     Phase 6: Implement workflows (DMF)
07-service-wiring.md         Phase 7: Wire inter-service communication (Löwy)
08-serialization-bridge.md   Phase 8: Bridge to infrastructure (DMF)
```

Every phase checkpoints with you before moving on.
Run only the phases you need; the orchestrators detect which files exist, start at the right phase, and flag files that are stale because an input changed after them.
Reviews from `arch-reviewer`, `arch-audit` and `design-check` go to `.claude/docs/reviews/`, in the shape defined by `references/review-findings.md`.
`references/artifact-pipeline.md` is the authoritative map of which file feeds which; `references/design-directory.md` defines the directory, the numbering shared with `dmf`, and staleness.

## Project Profile

Describe how your codebase maps the methods in `.claude/docs/architecture.md`: folders per layer, naming, messaging API, composition root, functional library, approved deviations, and known debt.
Every skill, agent and workflow in both plugins reads it first.
It replaces generic platform defaults, never the methodology rules, and a violation counts as accepted only when it is listed as an approved deviation.
The fitness tests use the same Approved deviations and Known debt as their baseline, so the profile and CI never disagree.
See `references/project-profile.md` for the contract.

## Fitness Tests

`fitness-tests` copies a Mono.Cecil analyzer and NUnit tests into your Unity project, and generates `ArchitectureProfile.cs` from the profile.
The tests read the compiled assemblies and check the closed architecture, Design Don'ts #2 and #6-#12, gerund naming, and Managers per subsystem.
They fail on any violation the profile does not list, and on known debt that has been fixed but not removed from the baseline, so debt only shrinks.
Rules that need use-case boundaries (#1, #3-#5) or judgment stay with the agents and workflows.

## Layout

```
lowy/
├── .claude-plugin/plugin.json   Declares the dmf dependency
├── agents/          Read-only reviewers
├── workflows/       arch-audit and design-check
├── references/      Layers and Don'ts, call chains, the 8-file pipeline, plus the contracts shared
│                    with dmf: project profile, review findings, design directory
├── skills/          One folder per skill, with its own references, output templates and code templates
└── tests/fitness/   Regression tests for the fitness-test analyzer, against a fixture assembly
```

## Maintaining

Bump `version` in `.claude-plugin/plugin.json` with every change you want users to receive; installed copies stay on their version until it changes.
`references/project-profile.md`, `review-findings.md` and `design-directory.md` have identical copies in `plugins/dmf/references/`: change both, then run `bash scripts/check-shared.sh` from the repository root.
Run `claude plugin validate plugins/lowy` before pushing.
After changing anything under `skills/fitness-tests/templates/`, run `dotnet test plugins/lowy/tests/fitness` (needs the .NET 8 SDK or later); the core project compiles the templates under Unity's constraints (.NET Standard 2.1, C# 9).
A new analyzer rule needs a case in `tests/fitness/Fixture/Shop.cs` and its expected violation in `AnalyzerTests.cs`.

## Sources

- Juval Löwy, *Righting Software* (Addison-Wesley, 2019)
- Scott Wlaschin, *Domain Modeling Made Functional* (Pragmatic Bookshelf, 2018)
