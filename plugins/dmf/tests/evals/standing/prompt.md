---
max_turns: 60
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Twice this month we found member records that can't be right: one member was suspended with no end date, and another had a suspension end date but wasn't suspended.
Change `Member` so neither can happen again, and fix the code that sets or reads those fields.
Keep `Member` and any types it needs in src/Library/Members/Member.cs.
