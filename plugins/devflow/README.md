# devflow

A Claude Code plugin for multi-agent development workflows built on **Löwy's Method** (Juval Löwy, *Righting Software*) and **Domain Modeling Made Functional** (Scott Wlaschin).
Each workflow splits the work into independent roles, so no agent reviews its own work: one agent writes, others review blind, skeptics verify, a judge rules.

It starts with planning: a feature plan format, and a plan review in which a writer drafts the plan, independent Löwy, call-chain, DMF and delivery reviewers check it, skeptics try to refute every serious finding, a judge rules on what survives, and the writer applies the rulings.
An implementation workflow that executes an approved plan phase by phase is next.

It builds on the [`lowy`](../lowy/README.md) and [`dmf`](../dmf/README.md) plugins: their reviewer agents are the Löwy and DMF lenses.
Installing `devflow` installs both.

## Install

From inside the repository that needs it:

```
claude plugin marketplace add TutanDev/cc-resources
claude plugin install devflow@cc-resources --scope project
```

Project scope records the plugin in that repository's `.claude/settings.json`, so it is on for the whole team and off in your other repositories.
Then run `/reload-plugins` or start a new session.

## Skills

| Skill | Role |
|---|---|
| `plan-feature` | Entry point: clarifies the request with you, has the writer draft the plan, runs the review, then takes your answers and approval |

## Agents

| Agent | Role |
|---|---|
| `devflow:plan-writer` | Drafts a plan from a brief by reading the code, the profile and the design directory; applies a judge's rulings; records your answers and approval |
| `devflow:plan-reviewer` | Read-only delivery lens: traceability, phases that leave the build green, checkable acceptance criteria, tests, end-to-end verification, risks |
| `devflow:plan-judge` | Read-only: accepts, rejects or sends to you each verified finding, merges duplicates, settles conflicts between lenses, writes the exact change |

The review also runs `lowy:lowy-reviewer`, `lowy:call-chain-validator` and `dmf:dmf-reviewer` on the plan.

## Workflows

| Workflow | Use |
|---|---|
| `/devflow:review-plan <feature> [--thorough] [--lenses=lowy,chains,dmf,plan] [--rounds=N]` | Review a plan, verify the findings, judge them, revise the plan, and re-review the changes once |

`--thorough` verifies each critical and major finding with three independent skeptics instead of one.
`--rounds=N` sets the most review rounds (default 2): a round after the first runs only when the judge accepted a critical or major change, and it reviews only those changes and what they broke.
`--out=<folder>` writes the report somewhere other than `.claude/docs/reviews/`, and `--date=YYYY-MM-DD` fixes its date.

Workflows need the Workflow tool; where your plan has it off by default, add `"enableWorkflows": true` to your settings.
Without it, `plan-feature` runs the same agents directly, without the verification pass.
In `claude -p` (scripts, CI), allow the `Workflow` tool and set `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`: workflows run in the background, and a print session otherwise stops them 10 minutes after its last turn.

## Quick Start

| You want to... | Say |
|---|---|
| Plan a feature | `/devflow:plan-feature <what the feature does>` |
| Review a plan you wrote or edited | `/devflow:review-plan <feature>` |
| Answer a plan's open questions, or approve it | `/devflow:plan-feature <feature>` |

## How It Works

```
you ──▶ plan-feature: clarify ──▶ plan-writer: draft
                                        │
                     ┌──────────────────┼──────────────────┬──────────────────┐
                     ▼                  ▼                  ▼                  ▼
               lowy-reviewer   call-chain-validator   dmf-reviewer      plan-reviewer
                 (Löwy)         (one per use case)       (DMF)           (delivery)
                     └──────────────────┼──────────────────┴──────────────────┘
                                        ▼
                     skeptics try to refute each critical and major finding
                                        ▼
                     plan-judge: accept, reject, or ask you
                                        ▼
                     plan-writer: apply, log the round in §9
                                        ▼
               re-review the changes once, if a critical or major change was made
                                        ▼
                     report ──▶ you: answer the open questions, approve
```

The roles are independent by construction:

- The reviewers see the plan and the code, never the writer's reasoning or each other's findings.
- A finding reaches the judge only after a skeptic, prompted to refute it, failed to.
- The judge rules but never edits: the writer applies the rulings, so no change enters the plan without a ruling behind it.
- When lenses disagree, Löwy decides where things live (services, layers, call chains), DMF decides what lives inside them (types, signatures, errors), and the delivery lens decides how the work is cut and checked.
- Only you approve a plan.

## The Plan

Plans live in `.claude/docs/plans/<feature>.md`, in nine fixed sections:

```
1 Goal                      5 Domain Model Impact (DMF)
2 Scope                     6 Phases, each with acceptance criteria and tests
3 Use Cases                 7 Verification, end to end
4 Architecture Impact       8 Risks, Assumptions and Open Questions
  (Löwy)                    9 Decision Log
```

Every phase leaves the build green, every acceptance criterion is checkable by an agent, and every ruling and answer is logged in §9.
A plan goes from `draft` to `reviewed` to `approved` (by you only), then `in-progress` and `done` as it is implemented.
`references/feature-plan.md` is the contract, and `references/plan-template.md` the skeleton.
Reviews go to `.claude/docs/reviews/<feature>-plan-review-<date>.md`.

A plan is for a feature of a system that exists.
For a new system or subsystem, run the 8-phase design pipeline first (`lowy:architecture-advisor`); plans then build on its design directory.

## Project Profile

Every agent reads `.claude/docs/architecture.md`, as in the `lowy` and `dmf` plugins.
Its optional **Verification** section gives the build and test commands and how to run the app; plans copy them into §7.
See `references/project-profile.md` for the contract.

## Layout

```
devflow/
├── .claude-plugin/plugin.json   Declares the lowy dependency
├── agents/          plan-writer, plan-reviewer, plan-judge
├── skills/          plan-feature
├── workflows/       review-plan
├── references/      The plan contract and template, plus the contracts shared with lowy and dmf:
│                    project profile, review findings, design directory
└── tests/           Control-flow tests for the workflows, with stub agents
```

## Maintaining

Bump `version` in `.claude-plugin/plugin.json` with every change you want users to receive.
`references/project-profile.md`, `review-findings.md` and `design-directory.md` have identical copies in `plugins/dmf/references/` and `plugins/lowy/references/`: change all three, then run `bash scripts/check-shared.sh` from the repository root.
Run `node plugins/devflow/tests/review-plan.test.mjs` after changing `workflows/review-plan.js`, and `claude plugin validate plugins/devflow` before pushing.
Keep the workflow scripts LF-only and plain JavaScript: the Workflow tool rejects carriage returns and TypeScript syntax.

## Sources

- Juval Löwy, *Righting Software* (Addison-Wesley, 2019)
- Scott Wlaschin, *Domain Modeling Made Functional* (Pragmatic Bookshelf, 2018)
