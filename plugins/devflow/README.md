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
| `/devflow:review-plan <feature> [--thorough] [--lenses=lowy,chains,dmf,plan] [--rounds=N]` | Reviews and revises a plan, round by round: blind reviewers, verification, the judge's rulings, the writer applying them, and a report per round |

`--thorough` verifies each critical and major finding with three independent skeptics instead of one.
`--rounds=N` sets the most rounds in one run (default 2): another round runs only when the judge accepted a critical or major change, and it reviews only those changes and what they broke.
`--date=YYYY-MM-DD` fixes the reports' date.
Rounds are numbered over the plan's whole life, so a review after you answer its questions starts at the round after the last one in §9.

Workflows need the Workflow tool; where your plan has it off by default, add `"enableWorkflows": true` to your settings.
Without it, `plan-feature` runs the same agents directly, without the verification pass.
The workflow's agents read the plugins' reference files and write the plan and the reports, so allow both first (see [Permissions](#permissions)).
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
                                        │
                     ┌──────────────────┴──────────────────┐
                     ▼                                     ▼
   plan-writer: apply the rulings, log §9      the round's report
                     └──────────────────┬──────────────────┘
                                        ▼
               re-review the changes once, if a critical or major change was made
                                        ▼
                     you: answer the open questions, approve
```

The roles are independent by construction:

- The reviewers see the plan and the code, never the writer's reasoning or each other's findings.
- A finding reaches the judge only after a skeptic, prompted to refute it, failed to.
- The judge rules but never edits: the writer applies the rulings, so no change enters the plan without a ruling behind it.
- When lenses disagree, Löwy decides where things live (services, layers, call chains), DMF decides what lives inside them (types, signatures, errors), and the delivery lens decides how the work is cut and checked.
- Only you approve a plan.

## Permissions

Plans and reports live under `cc-docs/` at the repository root, and the review workflow's agents write them: the writer revises the plan, and a report agent writes each round's report.
The reviewers also read their plugins' reference files, which Claude Code installs under `~/.claude/plugins/`, outside your repository.
Workflow agents run in the background, so they cannot ask you to approve a read or a write, and Claude Code refuses it unless a permission already covers it.
Allow both with one of:

- auto mode;
- two allow rules in your user settings, `~/.claude/settings.json`, which work in every mode and from any folder:

  ```json
  { "permissions": { "allow": ["Read(~/.claude/plugins/**)", "Edit(//**/cc-docs/**)"] } }
  ```

acceptEdits mode is not enough on its own: it allows writes only in the folder Claude Code started in, and no reads outside it.
`~/` is your home folder, so the `Read` rule covers the installed plugins and nothing else.
`Edit` rules cover every tool that writes files, and the leading `//` makes the pattern match `cc-docs/` wherever it is; without it, the pattern is relative to the folder Claude Code started in.
A plugin cannot ship these rules: Claude Code ignores permissions in a plugin's settings.
The [`workstation`](../workstation/README.md) plugin from this marketplace adds both to your user settings when a session starts.
The workflow makes one small read and one small write before any reviewer runs, and stops with these options when either is refused, so no review work is lost.
Without them, `plan-feature` still drafts the plan and records your answers, with the writer in the foreground, and Claude Code asks you to approve its reads and writes.

The documents stay out of `.claude/`, because Claude Code refuses every write there from a background agent, whatever the permissions.
Earlier versions kept them in `.claude/docs/`: move them with `git mv .claude/docs cc-docs`.

## The Plan

Plans live in `cc-docs/plans/<feature>.md`, in nine fixed sections:

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
Each review round's report goes to `cc-docs/reviews/<feature>-plan-review-<date>-round-<n>.md`.

A plan is for a feature of a system that exists.
For a new system or subsystem, run the 8-phase design pipeline first (`lowy:architecture-advisor`); plans then build on its design directory.

## Project Profile

Every agent reads `cc-docs/architecture.md`, as in the `lowy` and `dmf` plugins.
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
To run a workflow from a checkout with `--plugin-dir`, allow reads of that checkout too, or use auto mode: the `Read` rule above covers only the installed plugins.

## Sources

- Juval Löwy, *Righting Software* (Addison-Wesley, 2019)
- Scott Wlaschin, *Domain Modeling Made Functional* (Pragmatic Bookshelf, 2018)
