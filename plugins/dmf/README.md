# dmf

A Claude Code plugin for **Domain Modeling Made Functional** (Scott Wlaschin) in C#: discover the domain, model it with types that make illegal states unrepresentable, implement workflows as Result-based pipelines, and bridge them to serialization and persistence.
It also reviews existing code for DMF modeling and for functional style, after Enrico Buonanno's *Functional Programming in C#*.
Its hooks hold C# work to the skills, so design, implementation and review go through them whatever the prompt says.
They also log every reviewer run, with the time it took, the tokens it spent and its report.

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

## Hooks

Function hooks hold C# work to the skills, instead of leaving it to whether a skill's description matched the prompt.
`lowy` and `devflow` install `dmf`, so they bring these hooks too.

| When | What happens |
|---|---|
| Every session | A section of the system prompt routes designing, implementing and reviewing C# to the matching skill or reviewer |
| A C# file is about to be written | The call is refused until the agent writing it has loaded `domain-modeling`, `workflow-implementation`, `serialization-persistence` or `orchestrator`; the refusal says which fits what |
| A turn that changed C# is about to end | It is sent back once, with the files, to run `dmf:fp-reviewer`, and `dmf:dmf-reviewer` where types, workflows or DTOs changed |
| `/code-review` runs | It also runs both dmf reviewers on the C# in scope and reports their findings that hold |
| `/simplify` runs | It also runs `dmf:fp-reviewer` on the changed C# and applies its refactors that hold |

- A skill counts for the agent that loaded it: the main conversation, a subagent, or a fork of an agent that had one.
  A fresh subagent loads its own, so code it writes is written with the guidance too.
- `domain-discovery` alone does not open the gate: it shapes a design, not code.
- Code with little domain logic in it, such as an editor window, a MonoBehaviour or a test, still goes through the closest skill.
- Writes are seen through `Edit`, `Write`, Serena's editing tools, and a shell command that redirects into a `.cs` file, `tee`s into one, edits one in place with `sed -i`, or writes one with `Set-Content`, `Add-Content` or `Out-File`.
- Generated C# (`*.g.cs`, `*.designer.cs`, `*.generated.cs`) and build output under `obj/` and `bin/` are not held.
- A turn that ran a dmf reviewer ends as it is, fixes made after the review included.
- A turn that was sent back and still ends without a review ends: the hook asks once, so a person who asked for no review is not argued with.
- A turn that waits on background work ends as it is, and the next one is judged on everything written meanwhile.
- A `/clear` starts over: a skill loaded before it no longer counts.

Limits:

- A file a shell command writes some other way, such as `cp`, `mv` or a script, is not seen.
- A Serena `replace_in_files` call over the whole project, with no `.cs` path or glob, is not seen.
- The hooks are built on function hooks, an early-access Claude Code API, and were written and tested on Claude Code 2.1.314.

## Reviewer Log

Every run of `dmf:fp-reviewer` and `dmf:dmf-reviewer` is logged: how long it took, the tokens it spent and the report it gave.

- When a run ends, a line in the transcript says how it ended, how long it took and what it spent, such as `dmf:fp-reviewer finished in 34s · 58.4k tokens, 3.6k of them output`.
  Claude never reads the line, so it costs nothing.
- `/dmf-reviews` opens a pane listing the reviewers running now and the runs that ended, newest first, under their totals.
  Select a run to see its date, project, duration, model, tokens and full report; `b` goes back to the list.
- Tokens are summed over every request the reviewer made: input, cache writes, cache reads and output.
  That is more than the count on the Agent tool's row, which is about how large the reviewer's context grew by its last request.
- The newest 50 runs are kept across sessions and projects, in the plugin's own store, and a report over 40,000 characters is kept cut.
- A reviewer resumed with a message is logged again for that run.
- The log never stands in the way of what it logs: a failure in it is reported, and the spawn or the turn goes on as it would without it.
- The log was written and tested on Claude Code 2.1.317.

## Quick Start

| You want to... | Say |
|---|---|
| Model a domain end-to-end | "Model this domain: ..." or `/dmf:orchestrator <description>` |
| Model types for one area | "Model the domain types for pricing" |
| Implement a workflow | "Implement place-order as a pipeline" |
| Bridge to storage or the network | "Create DTOs and persistence for the order model" |
| Review existing code | "Review `Assets/Scripts/Orders` for DMF and functional style" |

## How It Works

Each phase writes a numbered file to `cc-docs/design/<topic>/` in your project, and later phases read the earlier files:

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
The orchestrator opens a todo list with all four phases first, and a phase it does not run stays there with the reason, so none is skipped silently.
Run only the phases you need: the orchestrator routes to the phase you ask for, checks that its input files exist, and flags files that are stale because an input changed after them.
`references/design-directory.md` defines the directory, the numbering, and staleness.

## Project Profile

Describe how your codebase maps the method in `cc-docs/architecture.md`: domain folders, functional library, composition root, approved deviations, and known debt.
Every skill and agent reads it first.
It replaces generic platform defaults, never the methodology rules, and a violation counts as accepted only when it is listed as an approved deviation.
See `references/project-profile.md` for the contract.

## Layout

```
dmf/
├── .claude-plugin/plugin.json
├── agents/          Read-only reviewers
├── hooks/           The function hooks that hold C# work to the skills, and the reviewer log
├── references/      C# mapping for DMF and functional-style guidelines, plus the contracts shared
│                    with lowy: project profile, review findings, design directory
├── skills/          One folder per skill, with its own references and output templates
├── tests/           The hooks' tests
└── types/           The session values the hooks keep, as a typed contract
```

## Maintaining

Bump `version` in `.claude-plugin/plugin.json` with every change you want users to receive; installed copies stay on their version until it changes.
`references/project-profile.md`, `review-findings.md` and `design-directory.md` have identical copies in `plugins/lowy/references/` and `plugins/devflow/references/`: change all three, then run `bash scripts/check-shared.sh` from the repository root.
Run `claude plugin test plugins/dmf` and `claude plugin validate plugins/dmf` before pushing.
To try a hooks change live, load the folder for one session with `claude --plugin-dir plugins/dmf`; saving a file reloads the hooks.
Claude Code lays the API's types in `.claude-plugin/types/` when it loads the folder, and `tsconfig.json` extends them, so `tsc -p plugins/dmf` type-checks the hooks.

## Sources

- Scott Wlaschin, *Domain Modeling Made Functional* (Pragmatic Bookshelf, 2018)
- Enrico Buonanno, *Functional Programming in C#* (Manning)
