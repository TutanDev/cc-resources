---
type: llm
focus:
  source: file
  path: src/Library/Loans/Checkout.cs
---

The file holds a checkout for a library: from a loan request it returns a loan, or refuses it under one of the borrowing rules.

PASS if the checkout gives every refusal back as a returned value, and that value's type has a distinct case for each refusal the rules name: no such member, member suspended, no such copy, copy reference-only, copy already on loan, too many loans, and too much in unpaid fines.
A caller must be able to tell these refusals apart by type or case, without reading a message string.

FAIL if any expected refusal is signalled by throwing an exception, by returning null or false, or only by a message string.
FAIL if two of the refusals listed above share one case and can be told apart only by text.
