---
name: correct
description: Find the mistakes agents keep repeating in this project and make each one impossible. Try architecture first, then types, then a check whose error names the fix (a Roslyn analyzer, a lowy fitness test or a house-rules hook), then a test, and write docs last. Prove each new check fails on a real past mistake. Use for /house-rules:correct, and again each time the person has to correct an agent for something it was told before.
disable-model-invocation: true
---

# Correct

The person keeps correcting agents in this project for the same mistakes.
Change the project so the next agent cannot make them.

Assume every contributor is an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles.
Design the project so a change that looks right from one file is right for the whole project.

## 1. Find the mistakes

Read these, newest first:

- **What the person said to agents here.**
  From the project's root, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/list-corrections.mjs"`.
  It prints each message the person typed, and each tool call they refused with a reason, after the tool calls the agent made just before it.
  Add `--since YYYY-MM-DD` or `--max N` when the list is long.
  It reads this project's transcripts and no other project's.
  Do not read another project's transcripts in any other way either: they hold private conversations about unrelated work.
- **Recent commits and reverts:** `git log --since=<date> --stat`, `git log -i --grep=revert`, and commits that undo part of an earlier one.
- **Review comments:** on GitHub, `gh pr list --state all --limit 30`, then `gh pr view <number> --comments` on the ones with a discussion.
  A review agent's findings count too, such as a `dmf` or `lowy` reviewer's report in the transcripts or a report under `cc-docs/`.
- **What the agents were told:** `CLAUDE.md`, `AGENTS.md`, `.claude/rules/`, and comments in the code that explain a workaround.

## 2. Group them into classes

A class is one kind of mistake that shows up in different places, such as "edits a generated file" or "throws for an expected failure".
A class counts once it has happened twice.
Keep the evidence for each class: the date, the session or commit, and what the person said.
A correction the person gave once is not a class, nor one that a check added since already refuses.

## 3. Pick the highest level that works

1. **Architecture.**
   Give each piece of state one owner and each task one supported way.
   Hide internals so the wrong import fails.
   Replace hand-synced lists with one source of truth.
   Delete old ways and dead code an agent would copy.
2. **Types**, so the bad state cannot be written.
   In C#, follow `dmf:domain-modeling`: a constrained type, a closed union, a stage of a lifecycle.
3. **A check whose error names the fix**, run where the mistake is made:
   - a Roslyn analyzer, for a C# mistake the compiler can see;
   - a `lowy` fitness test, for a dependency or layering mistake between Unity assemblies (`/lowy:fitness-tests`);
   - a `house-rules` hook, for a mistake in how an agent uses its tools in any project, such as a file it must not touch, a command it must not run or text it must not write;
   - a lint rule or a CI script, for anything else.

   If the pattern is already common, fail only when a change adds more of it.
4. **A test of the behavior.**
   Fix or delete any test that still passes when the behavior it checks breaks, or that fails when only the internals change.
5. **Docs or an agent rule**, last, and only for a judgment call.
   Nothing fails when an agent skips them.

For each class, say why each level above the one you picked does not work.

## 4. Ask

Show the person each class, most frequent first, with its evidence, the level you picked and why no higher level works.
Wait for their pick before you change anything.

## 5. Fix and prove

For each class the person picks:

- Make the change.
  A `house-rules` hook belongs to the plugin, not to this project: unless this project is the plugin's own repository, give the hook as a proposal in your reply, with its refusal text and the past mistake it would refuse.
- Prove that each new check fails on a real past mistake.
  Replay the mistake from its evidence, such as the edit in the transcript or the commit a revert undid, and show the check refusing it.
  A check that has never refused a real mistake is not done.
- Run the check the same way locally and in CI.
- Put an exception on the offending line, with a reason, an expiry date and the person's approval.
- Commit only when the person asks, one class per commit.

## 6. Keep the rule table

The project's agent instruction file keeps a table that pairs each rule with what enforces it, and says so where nothing does.
Add the rule when you fix its class, with what now enforces it.
When a rule in the table had nothing enforcing it and its mistake happened again, that is a repeat: fix it at the highest level in the same change.
Drop a rule once its mistake can no longer happen.

## Reply

For each class: its evidence, the level you picked, why no higher level works, and the check that now refuses it, with the past mistake it refused.
