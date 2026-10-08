---
name: arch-reviewer
description: "Composite: reviews an existing architecture (a code path, or a description) against Löwy's Method - layer placement, naming, Design Don'ts, use case call chains - and writes a scorecard. Delegates the reading to the lowy-reviewer and call-chain-validator agents and keeps the user checkpoints. Invoked by `lowys-method` or by the user with /lowy-dmf:arch-reviewer."
argument-hint: <code path, or description of the architecture>
---

Part of the `lowy-dmf` plugin: invoke sibling skills by their namespaced name (for example `lowy-dmf:list-volatilities`).

Review the following architecture against Löwy's Method: $ARGUMENTS

This is the interactive review: one lens (Löwy), with the user confirming the use cases.
For a multi-lens audit with adversarial verification (Löwy, call chains, DMF, functional style), run `/lowy-dmf:arch-audit` instead.

Findings follow `${CLAUDE_PLUGIN_ROOT}/references/review-findings.md`.
When the Agent tool is not available (for example inside a subagent), do each delegated phase yourself with the skill named in its fallback line.

## Phase 0: Scope
If `.claude/docs/architecture.md` exists, read it and apply it as described in `${CLAUDE_PLUGIN_ROOT}/references/project-profile.md`.

- A path (or nothing, inside a repository): review the code. Docs are claims to verify against it.
- A description: review it as given, and state that the findings are unverified against code.

## Phase 1: Structural Review
Delegate to the `lowy-dmf:lowy-reviewer` agent with the target, and with the description when there is no code.
It builds the service inventory from the code and checks layers, naming, the 12 Design Don'ts, closed architecture, the Managers-to-Engines ratio, expendability, Utilities and decomposition smells.

Fallback: the `lowy-dmf:classify-structure` skill on an inventory you build from the code.

Show the user the inventory and the findings table before going on.
If the inventory misplaces a service, correct it with the user and send the correction back to the agent.

## Phase 2: Use Case Validation
Agree on 2-6 core use cases with the user.
When reviewing code, propose candidates from the Managers' public operations, and confirm them before tracing.

Delegate to the `lowy-dmf:call-chain-validator` agent with the target and the confirmed use cases.
It returns one chain per use case, with every hop checked, a verdict, the symmetry comparison, and any use case the services cannot satisfy.

Fallback: the `lowy-dmf:validate-use-cases` skill.

## Phase 3: Summary Report
Merge the two results.
Drop duplicates (the same rule on the same lines), keep the stronger evidence, and keep every finding's status: ❌ new violation, ⚠️ known debt, or ✅ approved deviation, per the project profile.

### Architecture Scorecard
- **Layer compliance:** ✅/⚠️/❌
- **Naming compliance:** ✅/⚠️/❌
- **Design Don'ts:** X violations found
- **Use case coverage:** X/Y core use cases validated
- **Symmetry:** ✅/⚠️/❌
- **Functional decomposition risk:** Low/Medium/High

### Recommended Actions
Prioritized list of changes, from most critical to least.

### Profile Gaps and Not Checked
Copy both sections from the agents' results: proposals for the profile (never applied without the user), and what could not be verified.

Save the report as `.claude/docs/reviews/<target>-lowy-review-<YYYY-MM-DD>.md`, where `<target>` is the kebab-case name of the reviewed subsystem or system.

If the review found mechanical violations (layer direction, Design Don'ts #2 and #6-#12, naming), offer `/lowy-dmf:fitness-tests` so they cannot come back unnoticed.
