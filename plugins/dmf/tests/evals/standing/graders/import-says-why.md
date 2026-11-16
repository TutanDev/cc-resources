---
type: llm
focus:
  source: file
  path: src/Library/Data/LegacyImport.cs
---

The file reads members exported from an old system, one per line, as `id;name;junior;fines;suspended`.
The old export has a suspended flag but no end date, which is how a member came to be suspended with no end date.

PASS if the import can no longer produce a suspended member without an end date, and a line marked suspended is either read with an end date from somewhere the code names, or refused as a returned value that says why.

FAIL if a suspended line silently becomes a member in good standing.
FAIL if the import makes up an end date or a reason without saying where it comes from.
FAIL if a suspended line throws an exception.
