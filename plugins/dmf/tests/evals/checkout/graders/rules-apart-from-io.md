---
type: llm
focus:
  source: file
  path: src/Library/Loans/Checkout.cs
---

The file holds a checkout for a library.
It can read members, copies and loan counts from an `ILibraryStore`, save a loan to it, and read the date from an `IClock`.

PASS if the borrowing rules and the due date are decided by code that does no I/O: a function, or functions, that take the member, the copy, the member's loan count and today's date as plain parameters, and the new loan's id or a function that makes one too if they build the loan, and return the loan, its due date or the refusal.
The store and the clock are called only before that code, to gather its inputs, and after it, to save the loan.
Refusing a member or a copy that a lookup did not find, right after that lookup, counts as gathering inputs.

FAIL if a call to the store or the clock sits between rule checks, so that the rules cannot run without a store or a clock.
FAIL if the rules read the current date from `DateTime.Now`, `DateTime.Today` or `DateTime.UtcNow`, or call `Guid.NewGuid()` themselves rather than take the id, or a function that makes it, as a parameter.
