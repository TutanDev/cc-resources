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

## Evals

`tests/evals/` measures whether the skills change the code an agent writes, with `claude plugin eval`.
Each case is a request a person would type, in a small C# lending service written in plain object-oriented style.
The runner copies the service into an empty workspace and runs the request with `dmf`, and again without it.
A judge model then scores the file the agent wrote against one rubric per point, and the difference between the two scores is what `dmf` added.
Whether the agent loaded the skill and ran a reviewer is read from its transcript, and reported beside the score rather than counted in it.

| Case | The request | Graded on |
|---|---|---|
| `checkout` | Add the checkout for loans, whose rules are in a doc | Refusals as values, one case per rule; a result that holds one outcome; the request checked before any rule; the rules apart from I/O; the rules as written; `workflow-implementation` loaded |
| `standing` | Make a member's suspension impossible to get wrong, after two bugs | One closed choice for a member's standing; no way to build a bad one from outside; a legacy import that refuses as a value; `domain-modeling` loaded |

Run it from the repository root:

```
bash scripts/eval-plugin.sh dmf --model sonnet --judge-model opus
```

The script adds what the cases need: `--scaffold` to lay out the project, `Write` and `Edit`, and reads of the plugin's own files, which the skills open as they would under the `workstation` plugin's read rule.
`--case checkout` runs one case, `--runs 1` one run of each, and `--ablation none` skips the runs without the plugin.
Each run writes its results and an HTML report into the suite's folder, under the run's start time, and git ignores them.

To test a skill change, run the suite on the change and on `main`, and compare each grader's pass rate.
Three runs per arm can move by one pass on noise alone, so raise `--runs` before acting on a small difference.

### First Measurement

On 2026-11-16, with Claude Code 2.1.325, Sonnet agents and an Opus judge, three runs per arm.
A run of the whole suite takes about four minutes and costs about $9: $6 for the agents and $3 for the judge, which the run's reported total leaves out.
`checkout` is from one such run, and `standing` from a later one, after its last rubric change.

| Case | With `dmf` | Without | Δ |
|---|---|---|---|
| `checkout` | 0.80 | 0.60 | +0.20 |
| `standing` | 0.78 | 0.56 | +0.22 |

| Grader | With `dmf` | Without |
|---|---|---|
| `checkout`: one refusal case per rule | 3 of 3 | 3 of 3 |
| `checkout`: one outcome | 3 of 3 | 3 of 3 |
| `checkout`: the request checked into typed values first | 0 of 3 | 0 of 3 |
| `checkout`: the rules apart from I/O | 3 of 3 | 0 of 3 |
| `checkout`: the rules as written | 3 of 3 | 3 of 3 |
| `standing`: one choice | 3 of 3 | 3 of 3 |
| `standing`: no way to build a bad one | 3 of 3 | 2 of 3 |
| `standing`: the import refuses as a value | 1 of 3 | 0 of 3 |

- Without `dmf`, the agent already returned a closed union with one refusal per rule, applied every rule correctly, and modeled the suspension as one choice.
- The clearest effect of `dmf` is the rules kept apart from I/O: a pure decision over values gathered first, against lookups between the checks.
- No run turned the request into typed values: each one guarded the raw strings with `string.IsNullOrWhiteSpace` and passed them on, with `dmf` as without.
  This is the first gap the suite shows in the skills.
- Every `checkout` run with `dmf` loaded `domain-modeling`, and only 1 of 3 also loaded `workflow-implementation`; either one opens the C# gate.
- Every run with `dmf` ran both reviewers.
- Every run's C# compiled with no warnings, built outside the runner from its `.cs` files and the fixture's project file.

### Reading the Scores

A judge's three votes on one file are not independent checks of the rubric.
In the first runs, two files with the same union got opposite verdicts, each unanimous.
Reading every failed verdict against the code found four rubrics that left the deciding shape open, and each now names it.
In the runs above, 1 verdict of 48 had a split vote, and every failed verdict read against the code held.

- After changing a rubric, read its verdicts against the code before trusting a difference.
- The runner keeps the votes, not the judge's reasons.
  To see why a rubric fails a file, give the rubric and the file to `claude -p --model opus` and ask for its reasoning.
  That is how the judge's FAILs on a record union were traced to the protected copy constructor C# gives every non-sealed record.
  `references/csharp-mapping.md` already accepts that leak, and the rubric now does too.

### Blinding

The suite follows pstack's eval playbook as far as the runner allows.

- The prompts read as a person's request, and nothing in the project's files mentions testing.
- The runner hides the suite's folder from the agent, under the read grant too, so it never sees a rubric or another case.
- Nothing of the person's loads in a run: no `CLAUDE.md`, settings, memory or other plugins.
- The judge runs on another model than the agents, and each judge call sees one file and one rubric.
  The runner's docs do not say whether the judge is told which arm a run came from.
- The runner names each workspace `claude-eval-<random>/home/cwd`, and the agent sees that path, in both arms alike.
- Shell tools are not granted, since a run on native Windows refuses them without a sandbox, so no grader builds or tests the code.

## Layout

```
dmf/
├── .claude-plugin/plugin.json
├── agents/          Read-only reviewers
├── hooks/           The function hooks that hold C# work to the skills, and the reviewer log
├── references/      C# mapping for DMF and functional-style guidelines, plus the contracts shared
│                    with lowy: project profile, review findings, design directory
├── skills/          One folder per skill, with its own references and output templates
├── tests/           The hooks' tests, and in evals/ the skills' eval suite
└── types/           The session values the hooks keep, as a typed contract
```

## Maintaining

Bump `version` in `.claude-plugin/plugin.json` with every change you want users to receive; installed copies stay on their version until it changes.
`references/project-profile.md`, `review-findings.md` and `design-directory.md` have identical copies in `plugins/lowy/references/` and `plugins/devflow/references/`: change all three, then run `bash scripts/check-shared.sh` from the repository root.
Run `claude plugin test plugins/dmf` and `claude plugin validate plugins/dmf` before pushing.
Run the [eval suite](#evals) after changing a skill, on the change and on `main`.
To try a hooks change live, load the folder for one session with `claude --plugin-dir plugins/dmf`; saving a file reloads the hooks.
Claude Code lays the API's types in `.claude-plugin/types/` when it loads the folder, and `tsconfig.json` extends them, so `tsc -p plugins/dmf` type-checks the hooks.

## Sources

- Scott Wlaschin, *Domain Modeling Made Functional* (Pragmatic Bookshelf, 2018)
- Enrico Buonanno, *Functional Programming in C#* (Manning)
