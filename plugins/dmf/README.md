# dmf

A Claude Code plugin for **Domain Modeling Made Functional** (Scott Wlaschin) in C#: discover the domain, model it with types that make illegal states unrepresentable, implement workflows as Result-based pipelines, and bridge them to serialization and persistence.
It also reviews existing code for DMF modeling and for functional style, after Enrico Buonanno's *Functional Programming in C#*.

It is useful in any C# codebase, and tuned for Unity and XR.
Code is written in C# by default, following `references/csharp-mapping.md`; ask for F# to get the book's notation.
For system-level architecture on larger projects, add the [`lowy`](../lowy/README.md) plugin, which builds on this one.

## Install

In Claude Code:

```
/plugin marketplace add TutanDev/cc-resources
/plugin install dmf@cc-resources
```

Then run `/reload-plugins` or start a new session.

## Skills

Skills are namespaced under the plugin: type `/dmf:<skill>`, or describe what you want and Claude picks the right skill.

| Skill | Role |
|---|---|
| `orchestrator` | Entry point: routes to the phase skills, or runs the whole pipeline with checkpoints |
| `domain-discovery` | Phase 1: events, commands, bounded contexts, workflows, glossary |
| `domain-modeling` | Phase 4: constrained types, unions, lifecycle stages, workflow signatures |
| `workflow-implementation` | Phase 6: composable pipelines, Result-based errors, dependency injection |
| `serialization-persistence` | Phase 8: DTOs, domain mapping, persistence, versioning, CQRS |

## Agents

Read-only reviewers that run in their own context and return findings with `file:line` evidence.
Claude delegates to them from the skills, or when you ask for a review.

| Agent | Checks |
|---|---|
| `dmf:dmf-reviewer` | Domain types, illegal states, workflows, error unions, DTOs and versioning |
| `dmf:fp-reviewer` | Function-level functional style (guidelines G01-G12), with Unity hot-path exceptions |

## Quick Start

| You want to... | Say |
|---|---|
| Model a domain end-to-end | "Model this domain: ..." or `/dmf:orchestrator <description>` |
| Model types for one area | "Model the domain types for pricing" |
| Implement a workflow | "Implement place-order as a pipeline" |
| Bridge to storage or the network | "Create DTOs and persistence for the order model" |
| Review existing code | "Review `Assets/Scripts/Orders` for DMF and functional style" |

## How It Works

Each phase writes a numbered file to `.claude/docs/design/<topic>/` in your project, and later phases read the earlier files:

```
01-domain-discovery.md       Phase 1: Understand the domain
04-domain-model.md           Phase 4: Model types
06-workflow-pipelines.md     Phase 6: Implement workflows
08-serialization-bridge.md   Phase 8: Bridge to infrastructure
```

The numbers are fixed IDs shared with the `lowy` plugin, which fills the gaps (02, 03, 05, 07) with its own phases.
When those files exist, the DMF phases use them: types organized per service, workflows mapped to call chains, DTO boundaries taken from the service wiring.
Without them, each phase organizes its output by bounded context and says so.

Every phase checkpoints with you before moving on.
Run only the phases you need; the orchestrator detects which files exist, starts at the right phase, and flags files that are stale because an input changed after them.
`references/design-directory.md` defines the directory, the numbering, and staleness.

## Project Profile

Describe how your codebase maps the method in `.claude/docs/architecture.md`: domain folders, functional library, composition root, approved deviations, and known debt.
Every skill and agent reads it first.
It replaces generic platform defaults, never the methodology rules, and a violation counts as accepted only when it is listed as an approved deviation.
See `references/project-profile.md` for the contract.

## Layout

```
dmf/
├── .claude-plugin/plugin.json
├── agents/          Read-only reviewers
├── references/      C# mapping for DMF and functional-style guidelines, plus the contracts shared
│                    with lowy: project profile, review findings, design directory
└── skills/          One folder per skill, with its own references and output templates
```

## Maintaining

Bump `version` in `.claude-plugin/plugin.json` with every change you want users to receive; installed copies stay on their version until it changes.
`references/project-profile.md`, `review-findings.md` and `design-directory.md` have identical copies in `plugins/lowy/references/`: change both, then run `bash scripts/check-shared.sh` from the repository root.
Run `claude plugin validate plugins/dmf` before pushing.

## Sources

- Scott Wlaschin, *Domain Modeling Made Functional* (Pragmatic Bookshelf, 2018)
- Enrico Buonanno, *Functional Programming in C#* (Manning)
