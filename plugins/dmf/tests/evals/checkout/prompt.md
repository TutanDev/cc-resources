---
max_turns: 60
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Members can borrow from the app now, so we need the checkout.
The API hands us a `LoanRequest` and needs back either the loan with its due date, or the rule that refused it so the app can tell the member.
The rules are in docs/borrowing-rules.md.
Put the checkout, its types and its refusals in src/Library/Loans/Checkout.cs.
