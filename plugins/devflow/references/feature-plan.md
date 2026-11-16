# Feature Plan Contract

A feature plan says how one feature will be added to an existing system: what it does, where it lives in the architecture, what types it adds, and the phases that build it.
The `devflow:plan-writer` agent writes it, the `/devflow:review-plan` workflow reviews it, the writer applies the review's rulings, the user approves it, and an implementation workflow executes it one phase at a time.
Every agent in the `devflow` plugin reads this contract before writing, reviewing or judging a plan.

A plan is for a change to a system that exists.
A new system or a new subsystem needs the 8-phase design pipeline first (`lowy:architecture-advisor`); its plans then build on that design directory.

## Location

One file per feature: `cc-docs/plans/<feature>.md` at the repository root, where `<feature>` is a kebab-case name (for example `discount-codes`).
Only the `devflow:plan-writer` agent writes a plan, also when the review workflow runs it.
Before writing a plan, list `cc-docs/plans/` and reuse the file whose feature matches.
Each review round of a plan has its own report, `cc-docs/reviews/<feature>-plan-review-<YYYY-MM-DD>-round-<n>.md`, next to the other reviews.

Before writing or reviewing a plan, read the project profile if it exists (see `project-profile.md` in this folder).

## Header

```
# Plan: <Feature Title>

> Source: <the request, then every file the plan was built from: design files, the project profile>
> Status: <draft | reviewed | approved | in-progress | done>
> Revision: <n>, <YYYY-MM-DD>
```

`Revision` starts at 1 and goes up by one with every change to the plan, with the date of that change.

## Status

| Status | Set by | Meaning |
|---|---|---|
| `draft` | `devflow:plan-writer` | Written, not reviewed yet |
| `reviewed` | `devflow:plan-writer`, applying a review round | Reviewed and revised; it may still hold open questions |
| `approved` | The user, and only the user | Ready to implement: no open question, approval recorded in §9 |
| `in-progress` | The implementation workflow | At least one phase is done |
| `done` | The implementation workflow | Every phase is done and §7 passed |

No agent sets `approved` on its own judgment: it records the user's explicit approval, with its date, in §9.
A plan with an open question in §8 cannot be approved.
Any change to §1-§8 of an `approved` plan sets it back to `reviewed`, and the change goes into §9.
A plan that is `in-progress` or `done` is not revised by a review: the review only reports.

## Sections

The section numbers are fixed, so a finding can cite `§4.1` or `§6 Phase 2`.
A section that does not apply stays, with one line saying why (for example "No persisted data changes.").

Every reviewer, the judge and every developer agent reads the whole plan, so each line is paid for once per reader.
Say each fact once, in the section that owns it, and cite it elsewhere by its id or section (`UC-2`, `AC-3.1`, `§5.2`).
A type sketch shows the shape (the cases, the fields and the signatures), not the bodies.

### §1 Goal

What the feature does, for whom, and how anyone will know it works, in two to five sentences.
No solution detail: services, types and phases come later.

### §2 Scope

Two bullet lists: **In scope** and **Out of scope**.
Out of scope is required: it is what reviewers and the judge use to reject scope creep.

### §3 Use Cases

The use cases the feature adds or changes, each with a stable id:

```
### UC-1: <name>
- **Trigger:** the actor or event that starts it.
- **Steps:** the main path, as the user or system sees it.
- **Outcome:** what is true when it succeeds.
- **Failures:** each way it can fail, and what the user sees.
```

The call-chain review traces every use case listed here.

### §4 Architecture Impact (Löwy)

1. **Services:** a table with the service, its layer, the change (`new`, `changed` or `called`), its file (for an existing service), and why.
2. **Volatility:** the axis of volatility the feature falls on and the service that encapsulates it.
   A feature that exposes a new axis says so and names the service that will encapsulate it.
3. **Call chains:** for every use case in §3, the chain hop by hop, with caller, callee and call kind (sync, queued or event).
4. **Messaging:** new or changed commands and events, with their publisher and subscribers.

Existing services are named as the code names them; the profile's Mapping says where each layer lives.

### §5 Domain Model Impact (DMF)

1. **Types:** new and changed types as C# sketches (constrained types, unions, lifecycle stages), each with the illegal state it rules out.
2. **Workflows:** signatures that state their effects and dependencies.
3. **Errors:** the cases of the domain error union, one for each failure in §3.
4. **Boundaries:** DTOs, persistence changes, and how persisted data is versioned.

### §6 Phases

The ordered phases that build the feature, in the format and under the rules in [Phases](#phases).

### §7 Verification

How the finished feature is checked end to end after the last phase, the way a user would use it.

1. **Commands:** the commands that build the code and run the tests, from the profile or found in the repository.
2. **Scenarios:** one or more end-to-end scenarios that cover the main path of every use case, each with its setup, steps, and the result to observe.

### §8 Risks, Assumptions and Open Questions

- **Risks:** what could go wrong (data migration, serialization, threading, performance on a hot path, compatibility) and the mitigation.
- **Assumptions:** decisions the writer made because nobody stated them and the code could not answer them; each is a candidate question for the user.
- **Open questions:** `Q-1`, `Q-2` and so on, each with the question, the options, the recommendation, and what in the plan depends on the answer.
  A question that a run could settle also has a **Probe** line, until a probe settles it.
  An answered question moves to §9 with its answer.
- **Settled by probe:** each question a probe settled, under its `Q-n`: what the probe observed, the evidence (the command, and the output that decided it), and the decision, with the sections it was applied in.

#### Probes

A question is one of two kinds, and its kind decides who settles it:

- A **call** is a product, priority, budget or preference decision that no run can settle; only the user answers it.
- A **fact** is something a run could observe: how the code, a library or the platform behaves, what a command prints, how long something takes, whether a format round-trips.
  A probe settles it before anyone asks the user.

A probe is the smallest script or command that observes the fact.
It runs in a scratch folder outside the repository, never changes the product's code, and takes about ten minutes of work at most; the probes of one plan take about half an hour in all.
The writer cannot run anything, so it writes the probe on the question's **Probe** line: what to run, and which result picks which option.
`devflow:plan-feature` runs it, and the writer moves the question to **Settled by probe** with the evidence.
A probe that cannot settle its question (it needs longer, needs the product changed, or the result is unclear) leaves the question open for the user, with what the probe showed.
The user sees every settled question before approving, and may reopen one.

### §9 Decision Log

Append-only: entries are added, never edited or removed.
Each review round adds one table:

```
#### Round <n>, <YYYY-MM-DD> (<report file name>)

| Finding | Lens | Severity | Ruling | Reason | Applied in |
|---|---|---|---|---|---|
| L-1 | lowy | major | accepted | <why> | §4.1, Phase 2 |
| D-2 | dmf | minor | rejected | <why> | - |
| P-1 | plan | major | asked | <why> | Q-3 |
```

A round with nothing to rule on adds one line that says why instead, such as "No findings survived verification." or, for a round that re-reviews earlier changes and rules only on critical and major findings, "No critical or major finding survived verification."
Rounds are numbered over the plan's whole life: a later review continues from the last round in §9.
User decisions are entries too, each on its own line: `Q-3 answered, <YYYY-MM-DD>: <answer>; applied in <sections>.` and `Approved by the user, <YYYY-MM-DD>.`
So is a probe: `Q-4 settled by probe, <YYYY-MM-DD>: <decision>; applied in <sections>.`, with its evidence in §8.
Each entry is one sentence, so a line holds one sentence.

## Phases

Each phase in §6 has this shape:

```
### Phase 1: <name>
- **Goal:** one sentence: what works after this phase that did not before, naming by id each use case it completes.
- **Depends on:** earlier phases, or none.
- **Changes:** the services, types and files to add or change, citing §4 and §5.
- **Acceptance criteria:**
  - `AC-1.1` <an observable statement an agent can check>
  - `AC-1.2` ...
- **Tests:** the tests to add or change, each in one line with its kind (unit, property, integration or end-to-end).
  What a test proves is said once, in the acceptance criterion that names it.
- **Status:** pending
```

The rules:

1. **Green after every phase:** each phase leaves the code building and every test passing.
   A phase is never half a wiring change that only the next phase makes compile.
2. **Ordered by dependency:** no phase depends on a later one.
   Prefer the order the layers give: types and pure logic (DMF types, Engines, workflow steps) before the ResourceAccess and Managers that compose them, and Clients last.
3. **Small enough to review:** a developer agent implements a phase in one session, and a reviewer reads its diff in one sitting.
   As a guide, a phase touches at most about 15 files; a larger phase is split.
4. **Checkable criteria:** an agent checks every acceptance criterion without asking anyone, because the criterion names the test, the command and its expected output, or the behavior and how to observe it in the running app.
   "Works correctly" and "is clean" are not criteria.
5. **Tested behavior:** every new behavior has a test that would fail without it.
   Domain logic is tested through pure functions; the profile's test conventions say where the tests go.
6. **Stable ids:** `AC-<phase>.<n>` ids never change, so a new criterion takes the next free number and a removed one is never reused.
   The same holds for `UC-n` and `Q-n`.
7. **Complete coverage:** every use case in §3 is completed by some phase, every change in §4 and §5 lands in some phase, and every change in a phase traces back to §3, §4 or §5.

`Status` is `pending` or `done`; only the implementation workflow sets `done`.

## Structure Check

`scripts/check-plan.mjs` in the devflow plugin checks a plan against the rules of this contract that need no judgment: the header, the nine sections and their parts in order, the Out of scope list, each use case's and each phase's fields, the ids, every use case in §4.3, §6 and §7.2, §7's commands and scenarios, the fields of each question in §8, the rounds in §9, and what the status demands.
It prints each problem as `<file>:<line>: <what to fix>`, and exits 1 when there is one.
The devflow hooks run the same check wherever an agent reads or writes a plan:

- a write that breaks a rule the plan held tells the agent what broke, in the write's own result;
- an agent that hands back a plan it broke is sent back once to fix it, and problems the plan had before its first write are not counted against it;
- every Read of a plan carries the result, so the review workflow's Load phase and the delivery reviewer start from it.

What needs judgment stays with the reviewers: whether a phase is small enough, a criterion checkable, a test able to fail, a reason sound.

## Staleness

A plan is stale when a file on its `> Source:` line was modified after the plan (compare modification times).
The request on the Source line is text, not a file, and never makes a plan stale.
A stale plan is reviewed with the stale inputs named, so the review can check the plan against their current content.
