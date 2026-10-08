# Project Profile Contract

The methodology skills (Löwy, DMF) state the rules.
A project profile states how those rules map onto one codebase.
Every skill in this toolkit reads the profile before advising, reviewing, or producing artifacts.

## Location

`.claude/docs/architecture.md` at the project root.
If it does not exist, apply the methodology defaults and say so once.

## Sections

1. **Mapping** - how each methodology concept appears in code:
   - where subsystems, Clients, Managers, Engines, and ResourceAccess live (folders, namespaces, assemblies)
   - naming conventions per layer
   - the messaging API, and how a command differs from an event in it
   - the composition root and how dependencies are wired
   - the functional library and the conventions DMF-style code uses
2. **Approved deviations** - a table with: rule relaxed, scope (files or subsystems), justification (a measurement, for performance), date, and who approved it.
3. **Known debt** - existing code that violates a rule and has not been fixed yet.

## Precedence

- The methodology rules always apply.
- The Mapping section replaces generic platform defaults (for example the Unity adaptations in `architecture-advisor`), never methodology rules.
- A violation is acceptable only when it matches an **Approved deviations** entry: report it as ✅ approved and cite the entry.
- A violation listed in **Known debt** is reported as ⚠️ pre-existing debt: not a new finding, and never correct.
- Any other violation is ❌, even when the codebase does it consistently. Consistency is not approval.
- A project convention that contradicts a methodology rule without an Approved deviations entry is debt, and the profile should list it as such.
- Never add an Approved deviations entry yourself. Propose it to the user, who decides.
