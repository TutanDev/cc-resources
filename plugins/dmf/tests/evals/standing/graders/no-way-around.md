---
type: llm
focus:
  source: file
  path: src/Library/Members/Member.cs
---

The file holds a library member, whose suspension used to be three loose fields with public setters: a suspended flag, a nullable end date and a nullable reason.

PASS if code outside the file cannot build a suspension or a standing that lacks its parts: every way to create one, a constructor or a factory, takes the end date and the reason as non-nullable values, and no setter, initializer, default value or outside subclass yields one without them.
A positional record such as `Suspended(DateTime Until, string Reason)` meets this; checking that the reason is not blank is welcome but not required.

FAIL if a public setter or initializer still takes the loose parts of a suspension, such as a flag and a date set separately.
FAIL if a suspension's end date or reason is nullable.
FAIL if the standing type's base declares a public or protected constructor, so that any class can derive a new alternative from it.
The protected copy constructor that C# gives every record that is not sealed does not count: no record base can close it, and a private constructor beside it is the accepted closed union.
FAIL if the default value of a type in the file is a suspension without an end date.
