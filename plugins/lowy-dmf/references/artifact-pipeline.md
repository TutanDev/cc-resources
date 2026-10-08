# Artifact Pipeline - Phase-to-File Mapping

Each phase produces a numbered markdown file. Each file explicitly references which
previous files it consumes and which subsequent files it feeds. The numbering enforces
the sequence - a phase cannot produce its output without its input files existing.

## Design Directory

All numbered files for one design effort live in `.claude/docs/design/<topic>/` at the project root.
`<topic>` is the kebab-case name of the system or feature being designed (for example `video-sdk`).
Before starting any phase, list `.claude/docs/design/` and reuse the folder whose topic matches; create a new folder only for a new design effort.
Never write numbered files to the working directory root.

Before any phase, also read the project profile if it exists (see `project-profile.md` in this folder).

Template paths below are relative to the plugin root.

## The 8-File Chain

```
01-domain-discovery.md       ← Phase 1: UNDERSTAND    (DMF)
       │
       ▼
02-volatilities.md           ← Phase 2: DECOMPOSE     (Löwy)
       │
       ▼
03-layered-architecture.md   ← Phase 3: STRUCTURE     (Löwy)
       │
       ├──────────────────────────────┐
       ▼                              ▼
04-domain-model.md           05-call-chains.md
  Phase 4: MODEL (DMF)         Phase 5: VALIDATE (Löwy)
       │                              │
       ├──────────────────────────────┤
       ▼                              ▼
06-workflow-pipelines.md     07-service-wiring.md
  Phase 6: IMPLEMENT (DMF)     Phase 7: WIRE (Löwy)
       │                              │
       └──────────────┬───────────────┘
                      ▼
              08-serialization-bridge.md
                Phase 8: BRIDGE (DMF)
```

Note: Phases 4 and 5 can run in parallel - they both consume Phase 3 output
but do not depend on each other. Similarly Phases 6 and 7 can overlap.

## File Specifications

### 01-domain-discovery.md
- **Phase:** 1 - Understand
- **Methodology:** DMF
- **Skill:** `dmf-domain-discovery`
- **Template:** `skills/dmf-domain-discovery/references/output-template.md`
- **Consumes:** Raw requirements, interviews, business descriptions
- **Produces:** Events, commands, bounded contexts, context map, workflows, data structures, ubiquitous language, open questions
- **Fed into:** 02 (core use cases come from here), 03 (bounded contexts), 04 (data structures + workflows), 05 (workflows to map onto call chains), 08 (workflow list)

### 02-volatilities.md
- **Phase:** 2 - Decompose
- **Methodology:** Löwy
- **Skill:** `list-volatilities`
- **Template:** `skills/list-volatilities/references/output-template.md`
- **Consumes:** `01-domain-discovery.md` (domain overview, workflows, bounded contexts)
- **Produces:** Core use cases, axes of volatility, solutions-vs-requirements scrub, candidate services
- **Fed into:** 03 (candidate services), 05 (core use cases list)

### 03-layered-architecture.md
- **Phase:** 3 - Structure
- **Methodology:** Löwy
- **Skill:** `classify-structure`
- **Template:** `skills/classify-structure/references/output-template.md`
- **Consumes:** `02-volatilities.md` (candidate services, core use cases) + `01-domain-discovery.md` §2 (bounded contexts, for the §8 service→context mapping; if present)
- **Produces:** Service-to-layer classification, naming validation, ratio checks, Design Don'ts audit, service-to-bounded-context mapping
- **Fed into:** 04 (which types belong to which service), 05 (services to validate), 07 (services to wire)

### 04-domain-model.md
- **Phase:** 4 - Model Internals
- **Methodology:** DMF
- **Skill:** `dmf-domain-modeling`
- **Template:** (generated as C# type definitions by default, F# on request, organized per service; see `references/csharp-mapping.md`)
- **Consumes:** `03-layered-architecture.md` §8 (service→context mapping) + `01-domain-discovery.md` §6-7 (data structures + glossary)
- **Produces:** Simple constrained types, records, discriminated unions, workflow type signatures, per service
- **Fed into:** 06 (types to implement), 07 (domain types that need DTOs at boundaries), 08 (types to serialize)

### 05-call-chains.md
- **Phase:** 5 - Validate
- **Methodology:** Löwy
- **Skill:** `validate-use-cases`
- **Template:** `skills/validate-use-cases/references/output-template.md`
- **Consumes:** `03-layered-architecture.md` (classified services) + `02-volatilities.md` §2 (core use cases) + `01-domain-discovery.md` §6 (workflows, for the §7 workflow→service mapping; if present)
- **Produces:** Call chains per use case, symmetry analysis, non-core validation, workflow-to-service mapping, verdict
- **Fed into:** 06 (which service chain implements which workflow), 07 (call patterns to wire)

### 06-workflow-pipelines.md
- **Phase:** 6 - Implement
- **Methodology:** DMF
- **Skill:** `dmf-workflow-implementation`
- **Template:** (generated as pipeline code, organized per workflow)
- **Consumes:** `04-domain-model.md` (domain types) + `05-call-chains.md` §7 (workflow→service mapping)
- **Produces:** Pipeline step implementations, composition root, dependency injection, error handling strategy
- **Fed into:** 08 (implementations that need I/O bridges)

### 07-service-wiring.md
- **Phase:** 7 - Wire
- **Methodology:** Löwy
- **Skill:** `wire-services`
- **Template:** `skills/wire-services/references/output-template.md`
- **Consumes:** `03-layered-architecture.md` (services) + `05-call-chains.md` (validated call patterns) + `04-domain-model.md` (domain types behind each §6 DTO boundary; if present)
- **Produces:** Communication level recommendation, wiring table, event catalog, DTO boundary list, constraint compliance
- **Fed into:** 08 (DTO boundaries, event payloads to serialize)

### 08-serialization-bridge.md
- **Phase:** 8 - Bridge
- **Methodology:** DMF
- **Skill:** `dmf-serialization-persistence`
- **Template:** (generated as DTO definitions + fromDomain/toDomain code)
- **Consumes:** `04-domain-model.md` (domain types) + `07-service-wiring.md` §6 (DTO boundaries) + `06-workflow-pipelines.md` (I/O points)
- **Produces:** DTO types, fromDomain/toDomain functions, persistence strategy, event serialization
- **Fed into:** Implementation (this is the final architecture artifact)

## Orchestrator Behavior

When running the full pipeline, the `architecture-advisor` skill must:

1. **Before each phase:** Check that required input files exist. If not, state which file is missing and offer to produce it.
2. **After each phase:** Verify the output file was created and contains all required sections.
3. **At methodology transitions:** Explicitly name the transition and the files being handed off.
4. **On re-entry:** If the user returns to a phase, warn that downstream files may be stale and offer to regenerate them.

## Staleness

Every numbered file starts with a `> Source:` line naming the files it consumed.
A file is stale when any file it consumed was modified after it (compare modification times).
When an orchestrator starts, it lists stale files and offers to regenerate them in dependency order before continuing.
The **Consumes** lines above are authoritative; the chart at the top shows only the main flow.

## Reviews

Reviews are not numbered and feed no phase.
They go to `.claude/docs/reviews/` at the project root, one file per run:

| Producer | File |
|---|---|
| `arch-reviewer` skill | `<target>-lowy-review-<YYYY-MM-DD>.md` |
| `/lowy-dmf:arch-audit` workflow | `<target>-arch-audit-<YYYY-MM-DD>.md` |
| `/lowy-dmf:design-check` workflow | `<topic>-design-check-<YYYY-MM-DD>.md` |

Both workflows take `--out=<folder>` to write elsewhere.
A design-check report is stale when any file in its design directory was modified after it.
Every finding follows `review-findings.md` in this folder.

## Partial Pipelines

When running a subset of phases, still produce the numbered files for the phases executed.
Skip numbers for skipped phases - the gaps signal which phases were not run.

Example: User wants only macro-architecture → produces 01, 02, 03, 05 (skips 04, 06, 07, 08).
Example: User wants only domain modeling → produces 01, 04 (skips 02, 03, 05, 06, 07, 08).
