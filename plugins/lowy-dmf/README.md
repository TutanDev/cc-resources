# lowy-dmf

A Claude Code plugin that combines two architecture methods into one design pipeline:

- **Löwy's Method** (Juval Löwy, *Righting Software*) for macro-architecture: volatility-based decomposition, layered services, Design Don'ts, call chains, and service wiring.
- **Domain Modeling Made Functional** (Scott Wlaschin) for micro-architecture: domain discovery, type-driven modeling, workflow pipelines, and serialization.

It is tuned for C#/Unity work, with XR-specific adaptations.
Code is written in C# by default, following `references/csharp-mapping.md`; ask for F# to get the book's notation.

## Install

In Claude Code:

```
/plugin marketplace add TutanDev/cc-resources
/plugin install lowy-dmf@cc-resources
```

Then run `/reload-plugins` or start a new session.

## Skills

Skills are namespaced under the plugin: type `/lowy-dmf:<skill>`, or describe what you want and Claude picks the right skill.

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
| `dmf-orchestrator` | DMF orchestrator: routes to the DMF phase skills |
| `dmf-domain-discovery` | Phase 1: events, commands, bounded contexts, workflows, glossary |
| `dmf-domain-modeling` | Phase 4: constrained types, unions, lifecycle stages, workflow signatures |
| `dmf-workflow-implementation` | Phase 6: composable pipelines, Result-based errors, dependency injection |
| `dmf-serialization-persistence` | Phase 8: DTOs, domain mapping, persistence, versioning, CQRS |

## Agents

Read-only reviewers that run in their own context and return findings with `file:line` evidence.
Claude delegates to them from the skills and workflows, or when you ask for a review.

| Agent | Checks |
|---|---|
| `lowy-dmf:lowy-reviewer` | Service inventory from the code, layers, naming, the 12 Design Don'ts, closed architecture, ratios, smells |
| `lowy-dmf:call-chain-validator` | Each use case traced hop by hop through a design or the code, with a verdict per chain |
| `lowy-dmf:dmf-reviewer` | Domain types, illegal states, workflows, error unions, DTOs and versioning |
| `lowy-dmf:fp-reviewer` | Function-level functional style (guidelines G01-G12), with Unity hot-path exceptions |

## Workflows

Multi-agent runs that fan out reviewers in parallel, try to refute every finding against the code, and write one report.

| Workflow | Use |
|---|---|
| `/lowy-dmf:arch-audit <path> [--thorough] [--lenses=lowy,chains,dmf,fp]` | Audit existing code with every lens, per subsystem |
| `/lowy-dmf:design-check <topic> [--thorough]` | Check a design directory before implementing it: call chains, Don'ts, a change simulation per volatility axis, the domain model, staleness |

`--thorough` verifies each finding with three independent skeptics instead of one.
`--out=<folder>` writes the report somewhere other than `.claude/docs/reviews/`.

Workflows need the Workflow tool; where your plan has it off by default, add `"enableWorkflows": true` to your settings.
Without it, the routers run the same agents directly, without the verification pass.
In `claude -p` (scripts, CI), allow the `Workflow` tool and set `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`: workflows run in the background, and a print session otherwise stops them 10 minutes after its last turn.

## Quick Start

| You want to... | Say |
|---|---|
| Design a new system end-to-end | "Help me architect this system: ..." |
| Decompose into services only | `/lowy-dmf:system-decomposer <requirements>` |
| Review existing code with you in the loop | `/lowy-dmf:arch-reviewer <path>` |
| Audit a codebase in one run | `/lowy-dmf:arch-audit <path>` |
| Check a finished design | `/lowy-dmf:design-check <topic>` |
| Stop violations from coming back | `/lowy-dmf:fitness-tests` |
| Check one design question | "Is this a Manager or an Engine?", "Draw the call chain for checkout" |
| Model types for a known service | "Model the domain types for the pricing service" |

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
`references/artifact-pipeline.md` is the authoritative map of which file feeds which.

## Project Profile

Describe how your codebase maps the methods in `.claude/docs/architecture.md`: folders per layer, naming, messaging API, composition root, functional library, approved deviations, and known debt.
Every skill, agent and workflow reads it first.
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
lowy-dmf/
├── .claude-plugin/plugin.json
├── agents/          Read-only reviewers
├── workflows/       arch-audit and design-check
├── references/      Shared by several skills and agents: pipeline, project profile, layers and Don'ts,
│                    call chains, C# mapping for DMF, functional-style guidelines, findings contract
├── skills/          One folder per skill, with its own references, output templates and code templates
└── tests/fitness/   Regression tests for the fitness-test analyzer, against a fixture assembly
```

## Maintaining

Bump `version` in `.claude-plugin/plugin.json` with every change you want users to receive; installed copies stay on their version until it changes.
Run `claude plugin validate .` from the repository root before pushing.
After changing anything under `skills/fitness-tests/templates/`, run `dotnet test plugins/lowy-dmf/tests/fitness` (needs the .NET 8 SDK or later); the core project compiles the templates under Unity's constraints (.NET Standard 2.1, C# 9).
A new analyzer rule needs a case in `tests/fitness/Fixture/Shop.cs` and its expected violation in `AnalyzerTests.cs`.

## Sources

- Juval Löwy, *Righting Software* (Addison-Wesley, 2019)
- Scott Wlaschin, *Domain Modeling Made Functional* (Pragmatic Bookshelf, 2018)
