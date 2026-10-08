# Design Directory Contract

Shared by the `dmf` and `lowy` plugins: each keeps an identical copy of this file, because an installed plugin cannot read another plugin's files.
It defines where numbered design files live, how they are numbered, and when they are stale.

## Location

All numbered files for one design effort live in `.claude/docs/design/<topic>/` at the project root.
`<topic>` is the kebab-case name of the system or feature being designed (for example `video-sdk`).
Before starting any phase, list `.claude/docs/design/` and reuse the folder whose topic matches; create a new folder only for a new design effort.
Never write numbered files to the working directory root.

Before any phase, also read the project profile if it exists (see `project-profile.md` in this folder).

## Numbering

File numbers are fixed IDs shared by both plugins, so their files interleave in one directory:

| File | Phase | Plugin | Skill |
|---|---|---|---|
| `01-domain-discovery.md` | 1 Understand | `dmf` | `dmf:domain-discovery` |
| `02-volatilities.md` | 2 Decompose | `lowy` | `lowy:list-volatilities` |
| `03-layered-architecture.md` | 3 Structure | `lowy` | `lowy:classify-structure` |
| `04-domain-model.md` | 4 Model | `dmf` | `dmf:domain-modeling` |
| `05-call-chains.md` | 5 Validate | `lowy` | `lowy:validate-use-cases` |
| `06-workflow-pipelines.md` | 6 Implement | `dmf` | `dmf:workflow-implementation` |
| `07-service-wiring.md` | 7 Wire | `lowy` | `lowy:wire-services` |
| `08-serialization-bridge.md` | 8 Bridge | `dmf` | `dmf:serialization-persistence` |

A skipped phase leaves a gap in the numbers, and the gap signals which phases were not run.
With only the `dmf` plugin, a design directory holds `01`, `04`, `06` and `08`.
Never renumber files to close a gap.

A phase uses a file produced by the other plugin only when that file exists.
When it does not, the phase applies its documented fallback and says so in its output.

## Source Line and Staleness

Every numbered file starts with a `> Source:` line naming the files it consumed.
A file is stale when any file on its `> Source:` line was modified after it (compare modification times).
When an orchestrator starts, it lists stale files and offers to regenerate them in dependency order before continuing.
When the user returns to an earlier phase, warn that the files downstream of it may be stale and offer to regenerate them.
