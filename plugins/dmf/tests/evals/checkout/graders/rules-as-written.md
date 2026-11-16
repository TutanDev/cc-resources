---
type: llm
focus:
  source: file
  path: src/Library/Loans/Checkout.cs
---

The file holds a checkout for a library, which must follow these rules.
A member may borrow a copy when all of these hold: the member exists and is not suspended, and a suspension ends on its end date; the copy exists, is not reference-only, and is not already on loan; the member holds fewer than 5 loans, or fewer than 3 for a junior member; and the member owes less than 10.00 in unpaid fines.
A loan lasts 21 days, or 7 days for a new release.

PASS if the code applies every one of these rules with these limits, sets the due date by the loan length, and saves a loan only when every rule holds.

FAIL if a rule is missing, or a limit is off by one, such as refusing at 4 loans, allowing 5, or allowing exactly 10.00 in fines.
FAIL if a suspension still refuses the loan on its end date or later, or stops refusing it before its end date.
FAIL if a loan is saved before all the rules have been checked.
