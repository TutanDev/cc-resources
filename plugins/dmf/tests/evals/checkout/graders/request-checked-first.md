---
type: llm
focus:
  source: file
  path: src/Library/Loans/Checkout.cs
---

The file holds a checkout for a library.
Its input, `LoanRequest`, carries two nullable strings from the member app: `MemberId` and `Barcode`.

PASS if the checkout turns both strings into checked values before any lookup or rule runs: a member id type and a barcode type that cannot hold a missing or blank value, or a validated request type whose fields cannot.
A missing or blank string is refused as a returned value, and the lookups and the rules are handed only the checked values.
Unwrapping a checked id to call the store's string-keyed methods is fine.

FAIL if a store lookup or a rule is handed the request's own strings, whether or not an inline check such as `string.IsNullOrWhiteSpace` guards them.
FAIL if a missing id would surface as a null reference, an exception, or a lookup with an empty key.
