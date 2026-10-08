# Call Chain Validation - Output Template

When completing the validation phase, produce a markdown file following this template.
Save the file as `05-call-chains.md` in the design directory `.claude/docs/design/<topic>/`.

This file is consumed by Phase 6 (`dmf-workflow-implementation`) and
Phase 7 (`wire-services`).

---

```markdown
# Architecture Validation: [System Name]

> Source: [link to 03-layered-architecture.md] + [link to 02-volatilities.md §2] + [link to 01-domain-discovery.md §6, if used]
> Date: [date]
> Status: [Draft | Review | Approved]

---

## 1. Core Use Cases Under Validation

From `02-volatilities.md` §2:

| # | Core Use Case | Description |
|---|---|---|
| 1 | [Name] | [1 sentence] |
| 2 | [Name] | [1 sentence] |

---

## 2. Call Chains

### Core Use Case 1: [Name]

**Participating services:** [list from 03-layered-architecture.md]

**Call chain:**
```
[Client] → [Manager]
              → [Engine] → [ResourceAccess] → [Resource]
              → [ResourceAccess] → [Resource]
              → publishes: [EventName]
```

**Layer compliance:**
| Step | From | To | Direction | Valid? |
|---|---|---|---|---|
| 1 | [Client] (Client) | [Manager] (Manager) | Down | ✅ |
| 2 | [Manager] (Manager) | [Engine] (Engine) | Down | ✅ |
| 3 | [Engine] (Engine) | [RA] (ResourceAccess) | Down | ✅ |
| 4 | [RA] (ResourceAccess) | [Resource] (Resource) | Down | ✅ |

**Design Don'ts check:** [None violated / List violations]

**Change containment test:**
> "What if the customer wants [specific change]?"
> → Change contained in: [Manager workflow code / Engine logic / Propagates - PROBLEM]

---

### Core Use Case 2: [Name]

[Repeat the same structure]

---

## 3. Symmetry Analysis

| Dimension | UC1 | UC2 | UC3 | Assessment |
|---|---|---|---|---|
| Layers involved | C→M→E→RA→R | C→M→E→RA→R | C→M→RA→R | ⚠️ UC3 skips Engine |
| Chain depth | 4 | 4 | 3 | Minor asymmetry |
| Services reused | E1, RA1 | E1, RA2 | RA1 | Good reuse of E1 |
| Manager complexity | 3 calls | 4 calls | 2 calls | Balanced |

**Symmetry verdict:** [Symmetric / Minor asymmetry (acceptable) / Significant asymmetry (investigate)]

If asymmetric: [Explain which services are unevenly loaded and what it implies
for the decomposition.]

---

## 4. Non-Core Use Case Validation

These use cases must be satisfiable with the SAME set of services - no new services allowed.
Different behavior = different Manager workflow code, not different architecture.

| # | Use Case | Satisfiable? | Services Used | Notes |
|---|---|---|---|---|
| 1 | [Name] | ✅ / ❌ | [list] | [notes] |
| 2 | [Name] | ✅ / ❌ | [list] | [notes] |

If any use case is NOT satisfiable:
> **Missing volatility detected:** [description]. Return to `list-volatilities` to
> add this to the decomposition.

---

## 5. "There Is No Feature" Check

For each service, verify it is NOT a feature:

| Service | Can describe without naming a feature? | Owns a feature? | Status |
|---|---|---|---|
| [Name] | [Yes: "encapsulates X volatility"] | No | ✅ |
| [Name] | [No: only makes sense for feature Y] | Yes | ❌ Functional decomposition |

---

## 6. Verdict

### Overall Assessment

- [ ] ✅ **Valid** - All core use cases supported, symmetry acceptable, no Design Don'ts violated
- [ ] ⚠️ **Partial** - Use cases [X, Y] need investigation: [reason]
- [ ] ❌ **Invalid** - Use case [X] cannot be satisfied. Missing volatility: [description]

### Discovered Issues

| Issue | Severity | Recommended Action |
|---|---|---|
| [description] | High / Medium / Low | [Return to Phase N / Acceptable tradeoff / Document and monitor] |

---

## 7. Workflow-to-Service Mapping

Maps each workflow from `01-domain-discovery.md` to the call chain that implements it.
This feeds Phase 6 (pipeline implementation) by showing which domain workflow maps to
which architectural service chain.

| Workflow (from 01-domain-discovery.md) | Manager | Engine(s) | ResourceAccess(es) | Pipeline Steps |
|---|---|---|---|---|
| [WorkflowName] | [Manager] | [Engine(s)] | [RA(s)] | [Step1 → Step2 → Step3] |

---

## 8. Open Questions

- [ ] [Question - who to ask or what to investigate]

---

## 9. Next Steps

- [ ] Implement workflow pipelines using `dmf-workflow-implementation`
- [ ] Input: `04-domain-model.md` types + this document's §7 (Workflow-to-Service Mapping)
- [ ] Output: `06-workflow-pipelines.md`
```
