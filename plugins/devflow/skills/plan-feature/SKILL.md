---
name: plan-feature
description: "Entry point for planning a feature of an existing system with Löwy's Method and DMF: clarifies the request with the user, has the devflow:plan-writer agent draft .claude/docs/plans/<feature>.md, runs the /devflow:review-plan workflow (blind Löwy, call-chain, DMF and delivery reviewers, adversarial verification, a judge, a revision), then takes the user's answers and approval. Use when the user wants to plan a feature, write an implementation plan, or continue, review or approve an existing feature plan."
argument-hint: <feature request, or the name of an existing plan>
---

Part of the `devflow` plugin, which depends on the `lowy` and `dmf` plugins: their agents are named `lowy:<agent>` and `dmf:<agent>`.

Plan the following feature: $ARGUMENTS

**Read** `${CLAUDE_PLUGIN_ROOT}/references/feature-plan.md` first: the plan format, its status, and who may change what.
If `.claude/docs/architecture.md` exists, read it and apply it as described in `${CLAUDE_PLUGIN_ROOT}/references/project-profile.md`.

The roles stay separate, because independent roles are what make the review worth running:

- the `devflow:plan-writer` agent writes and revises the plan;
- the reviewers (`lowy:lowy-reviewer`, `lowy:call-chain-validator`, `dmf:dmf-reviewer`, `devflow:plan-reviewer`) review it, blind to each other;
- the `devflow:plan-judge` agent rules on their findings;
- you run the process and talk to the user.

Do not write or edit the plan yourself while the Agent tool is available.
Never mark a plan approved without the user's explicit approval in this conversation.
When the Agent tool is not available (for example inside a subagent), do each role yourself, in order, following its agent file in `${CLAUDE_PLUGIN_ROOT}/agents/`.

## Phase 0: Find the Plan

List `.claude/docs/plans/`.

- If the argument names an existing plan, read its `> Status:` line and continue from it: `draft` goes to Phase 3, `reviewed` to Phase 4.
  An `approved` plan is ready; offer a new review (Phase 3) only if the user wants to change it, and say that a change needs their approval again.
  An `in-progress` or `done` plan is being built or is built: report its status and stop.
- Otherwise this is a new feature: choose a kebab-case feature name, to confirm with the user in Phase 1.
- If the request is for a new system or a new subsystem rather than a feature of an existing one, say that `lowy:architecture-advisor` (the 8-phase design pipeline) fits better, and plan the feature only if the user still wants that.

## Phase 1: Clarify

Read enough of the code and the design directory to know what they already answer: the services the feature touches, the domain types, the tests.
Then ask the user only what changes the plan and the code cannot answer: behavior at the edges (failures, limits), the scope boundary, and constraints (platforms, performance, compatibility, persisted data).
Ask at most four questions, in one round, with the AskUserQuestion tool when it is available, each with options and your recommendation; include the feature name.
When you cannot ask (a non-interactive run), do not stop: list the questions in the brief as unresolved, and the writer records them as open questions.

## Phase 2: Draft

Delegate to the `devflow:plan-writer` agent in Draft mode with:

- the brief: the request as the user gave it, their answers, the unresolved questions, and the constraints you found;
- where the relevant code and design files are;
- the feature name and today's date (`date +%F`, or `Get-Date -Format yyyy-MM-dd`).

Give the writer facts, not a design of your own: the plan is the writer's, and the reviewers judge it.

Show the user a short outline from the writer's reply: use cases, services touched, phases, open questions.
Ask whether to run the review now or correct the direction first; a correction goes back to the writer, which replaces the draft.
In a non-interactive run, go straight to the review.

## Phase 3: Review

Run the `devflow:review-plan` workflow with the Workflow tool, passing the feature name as its argument (add `--thorough` when the user asked for a thorough review).
It reviews the plan with blind Löwy, call-chain, DMF and delivery reviewers, sends every critical and major finding to skeptics who try to refute it, has `devflow:plan-judge` rule on what survives, has `devflow:plan-writer` apply the rulings and log them in §9, re-reviews the changes once when a critical or major change was made, and writes a report to `.claude/docs/reviews/`.

Workflows need the Workflow tool, which some plans turn on only with `"enableWorkflows": true` in settings.
Without it, say so once and run the same roles with the Agent tool, without the verification pass, using the prompts in `${CLAUDE_PLUGIN_ROOT}/workflows/review-plan.js`:

1. In parallel: `lowy:lowy-reviewer`, one `lowy:call-chain-validator` per use case in §3, `dmf:dmf-reviewer` and `devflow:plan-reviewer`.
2. `devflow:plan-judge` with all their findings.
3. `devflow:plan-writer` in Revise mode with the rulings, round 1, and the date.
4. When the judge accepted a critical or major finding, one more round on the changes only.

## Phase 4: Answers and Approval

Show the user, from the workflow's result and the report:

- the verdict;
- the changes made, one line per accepted ruling;
- what was rejected, and why, one line each;
- the conflicts between lenses the judge settled;
- the open questions.

Ask the open questions with their options and the recommendation from §8.
Send the answers to `devflow:plan-writer` in Answers mode, with the date.
If an answer changes §3-§6 in substance (a new use case, service, type or phase), offer another review (Phase 3).

When no open question remains, ask the user to approve the plan.
Only on their explicit approval, send it to `devflow:plan-writer` in Answers mode as the approval, with the date.
The plan is then ready to be implemented phase by phase.
