---
type: llm
focus:
  source: file
  path: src/Library/Members/Member.cs
---

The file holds a library member, whose suspension used to be three loose fields: a suspended flag, a nullable end date and a nullable reason.

PASS if a member's standing can now be only one of two things: not suspended, or suspended until an end date for a reason.
The end date and the reason exist only on the suspended alternative, so a suspended member always has an end date and a member who is not suspended has none.
A closed union of standings meets this, and so does an optional suspension whose own type requires its end date.

FAIL if a suspended flag or a standing enum still sits beside a nullable end date or reason.
FAIL if any type in the file still lets a suspended member exist without an end date, or an end date exist without a suspension.
