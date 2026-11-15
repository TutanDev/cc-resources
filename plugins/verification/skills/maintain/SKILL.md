---
name: maintain
description: "Keeps a project's verification skill (.claude/skills/verify-<app>/) and its feature map true as the app changes: one read-only feature-reader agent per feature file reads the source in parallel, one live session drives every feature, and the pass ends clean, changed (one change of proven corrections to the skill's own folder) or blocked. Never touches product code. Use when the user asks to maintain, audit, refresh or re-prove a verification skill or its feature map."
argument-hint: "[verify-<app>, when the project has several]"
---

Part of the `verification` plugin.

Maintain the verification skill: $ARGUMENTS

**Read** `${CLAUDE_PLUGIN_ROOT}/references/verify-skill.md` first: the contract the skill and its map are held to.
A feature map rots as soon as the app changes.
The unit of rigor is the feature, not the sentence: every feature file is read against the source and driven live, without proving every bullet.

## Edit Scope

Edit only the verification skill's own folder: its `SKILL.md`, its `features/` and the helpers it owns.
Never edit product code in this pass.
A behavior the map describes that the app no longer has is either drift, fixed in the map, or a regression in the product, reported and never papered over in the map.

## Outcomes

End with exactly one, and say which:

- **clean:** every feature got source and live coverage, and nothing needs to change.
- **changed:** one change of proven corrections to the skill's folder.
- **blocked:** coverage could not finish, or a proven fix could not ship safely; say exactly what blocked it.

## Pass

0. **Find the target:** list `.claude/skills/verify-*/`.
   With several, ask which; with none, stop and point at `verification:create` instead of inventing a target.
1. **Index:** read `features/README.md` and list the files beside it.
   Fix entries that are missing, extra, duplicated or dead.
2. **Source wave:** launch one `verification:feature-reader` agent per feature file, all in one message so they run concurrently, each given the skill's folder and its feature file.
   They read the source, and never drive the app or edit files.
3. **Reconcile:** check that every feature file came back with a report.
   Merge overlapping recipes into as few app states as you can.
   Spot-check the drift they cite, without re-proving what they found clean.
   Read the history since the proof status's date (`git log --since`) for user-facing surfaces the map misses, and call one missing only with the source path that adds it.
4. **Live pass:** required even when the source looks clean.
   You do all the driving, by the skill's own launch model: one long-lived instance driven in series for a server or a UI, a fresh isolated process per drive for a short-lived CLI.
   Drive every feature at least once, open every screenshot, saved response and transcript, and hold three rules whatever fails:
   - Never drive an instance you have not run doctor on since it last did something surprising: before the first drive, on each fresh session, and after any failed drive.
     Where doctor cannot see the failure, such as a UI stuck in a state on a healthy process, reset to a known state or relaunch.
   - The evidence captured so far survives every cleanup, checked at its location, not assumed.
   - Nothing a drive started outlives its use: clean up after a failed drive whether it is stuck, exited or shared, and on a shared instance clean up what the drive left, not the instance.

   A doctor failure caused by drift in the skill is drift: fix it within the edit scope and retry once, restarting only what the fix invalidated, before calling the pass blocked.
   A feature counts as unreachable only with the prerequisite it lacks (auth, entitlement, OS, external state) and the route tried; a map that omits that prerequisite has drifted.
   Re-drive every harness fix live before it ships.
   Tear down after the last drive, re-proofs included, so nothing outlives the pass; the evidence stays.
5. **Triage:** a wrong or missing description from the user's side is doc drift, and is fixed.
   Behavior that works but that the harness cannot drive is a harness gap, and is fixed, with each helper runnable as its invocation in the skill shows.
   Behavior that is broken is a product gap: record it for the person with its evidence, and keep it out of the change.
   Anything else that looks off in a screenshot goes in the report too, even when no feature file asked about it.
6. **Ship or stop:** for **changed**, re-read every changed file, set the proof status from this pass's run as the contract says, and show the person the change; commit it, as one commit, only when they ask.
   For **clean** or **blocked**, change nothing, and report the outcome and the coverage as they were.

Keep short run notes in the session's scratchpad (features covered, unreachable prerequisites, confirmed drift, the outcome), and do not commit them.
End with the outcome, the features driven, the product gaps with their evidence, and where the evidence is.
