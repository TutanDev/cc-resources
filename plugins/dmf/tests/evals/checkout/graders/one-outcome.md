---
type: llm
focus:
  source: file
  path: src/Library/Loans/Checkout.cs
---

The file holds a checkout for a library: from a loan request it returns a loan, or refuses it under one of the borrowing rules.

PASS if the type the checkout returns can hold exactly one outcome: a loan, or a refusal.
Code outside the type cannot build a value that holds both a loan and a refusal, or neither.
A closed union, or a result type with a private constructor and one factory per outcome, meets this.

FAIL if the returned type is a class or record whose public constructor, initializer or setters accept a success flag, a nullable loan and a nullable refusal together, so that a value with both or with neither can be built.
FAIL if the checkout returns a bare loan and reports refusals some other way.
