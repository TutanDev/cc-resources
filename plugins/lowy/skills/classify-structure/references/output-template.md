# Layered Architecture - Output Template

When completing the classification phase, produce a markdown file following this template.
Save the file as `03-layered-architecture.md` in the design directory `.claude/docs/design/<topic>/`.

This file is consumed by Phase 4 (`dmf:domain-modeling`), Phase 5 (`validate-use-cases`),
and Phase 7 (`wire-services`).

---

```markdown
# Layered Architecture: [System Name]

> Source: [link to 02-volatilities.md] + [link to 01-domain-discovery.md §2, if used]
> Date: [date]
> Status: [Draft | Review | Approved]

---

## 1. Architecture Overview

### Layer Diagram (ASCII)

```
┌─────────────────────────────────────────────────────┐  ┌───────────────┐
│  CLIENTS                                            │  │               │
│  [ClientName], [ClientName]                         │  │  UTILITIES    │
├─────────────────────────────────────────────────────┤  │               │
│  MANAGERS                                           │  │  [UtilName]   │
│  [ManagerName], [ManagerName]                       │  │  [UtilName]   │
├─────────────────────────────────────────────────────┤  │  [UtilName]   │
│  ENGINES                                            │  │               │
│  [EngineName], [EngineName]                         │  │               │
├─────────────────────────────────────────────────────┤  │               │
│  RESOURCE ACCESS                                    │  │               │
│  [AccessName], [AccessName]                         │  │               │
├─────────────────────────────────────────────────────┤  │               │
│  RESOURCES                                          │  │               │
│  [ResourceName], [ResourceName]                     │  │               │
└─────────────────────────────────────────────────────┘  └───────────────┘
```

---

## 2. Service Classification Table

| # | Service Name | Layer | Four Questions Answer | Volatility Encapsulated | Expendability |
|---|---|---|---|---|---|
| 1 | [PascalCase] | Client | Who: [description] | [from 02-volatilities.md] | N/A (Clients) |
| 2 | [PascalCase]Manager | Manager | What: [use case family] | [volatility] | [Expendable / Concern: reason] |
| 3 | [Gerund]Engine | Engine | How-business: [activity] | [volatility] | N/A (Engines) |
| 4 | [Noun]Access | ResourceAccess | How-access: [resource] | [volatility] | N/A (RA) |
| 5 | [Noun] | Resource | Where: [state location] | [volatility] | N/A (Resources) |
| 6 | [PascalCase] | Utility | Cross-cutting: [concern] | [infra volatility] | N/A (Utilities) |

---

## 3. Naming Validation

| Service | Convention Check | Result |
|---|---|---|
| [ManagerName]Manager | Noun prefix = encapsulated volatility | ✅ / ⚠️ [issue] |
| [Gerund]Engine | Gerund prefix = activity being performed | ✅ / ⚠️ [issue] |
| [Noun]Access | Noun prefix = associated resource | ✅ / ⚠️ [issue] |
| [UtilityName] | Is it a service (not a library)? Passes cappuccino test? | ✅ / ⚠️ [issue] |

---

## 4. Ratio Validation

| Metric | Expected | Actual | Status |
|---|---|---|---|
| Total services | ~10 (order of magnitude) | [n] | ✅ / ⚠️ |
| Managers | 2–5 | [n] | ✅ / ⚠️ |
| Engines | 2–3 | [n] | ✅ / ⚠️ |
| ResourceAccess + Resources | 3–8 | [n] | ✅ / ⚠️ |
| Utilities | ~6 | [n] | ✅ / ⚠️ |
| Manager-to-Engine ratio | [expected per golden ratio] | [actual] | ✅ / ⚠️ |

---

## 5. Design Don'ts Checklist

| # | Rule | Status |
|---|---|---|
| 1 | Client does NOT call multiple Managers in same use case | ✅ / ❌ |
| 2 | Client does NOT call Engines directly | ✅ / ❌ |
| 3 | Manager does NOT queue to >1 Manager in same use case | ✅ / ❌ |
| 4 | Engines do NOT receive queued calls | ✅ / ❌ |
| 5 | ResourceAccess does NOT receive queued calls | ✅ / ❌ |
| 6 | Clients do NOT publish system events | ✅ / ❌ |
| 7 | Engines do NOT publish events | ✅ / ❌ |
| 8 | ResourceAccess does NOT publish events | ✅ / ❌ |
| 9 | Resources do NOT publish events | ✅ / ❌ |
| 10 | Engines/RA/Resources do NOT subscribe to events | ✅ / ❌ |
| 11 | Engine does NOT call another Engine | ✅ / ❌ |
| 12 | ResourceAccess does NOT call another ResourceAccess | ✅ / ❌ |

---

## 6. Closed Architecture Rules

### Default Call Direction

```
Client → Manager → Engine → ResourceAccess → Resource
                         ↘ ResourceAccess → Resource
```

### Active Relaxations

| Relaxation | Where Applied | Justification |
|---|---|---|
| Manager → ResourceAccess (skip Engine) | [specific case] | [no Engine logic needed for this call] |
| [other relaxation] | [where] | [why] |

If no relaxations: "Strict closed architecture - no relaxations applied."

---

## 7. Subsystem Assessment

- Total building blocks: [n]
- Subsystem needed? [No - under 24 / Yes - partitioned as follows]

If subsystems needed:
| Subsystem | Managers | Services | Independent Business Value |
|---|---|---|---|
| [Name] | [≤3] | [list] | [what it delivers alone] |

---

## 8. Service → Bounded Context Mapping

Maps each architectural service to the bounded context(s) from `01-domain-discovery.md`
that it serves. This mapping feeds Phase 4 (domain type modeling per service).

| Service | Layer | Bounded Context(s) | Domain Types to Model |
|---|---|---|---|
| [ServiceName] | [layer] | [Context from 01-domain-discovery.md] | [Key types this service will own] |

---

## 9. Open Questions

- [ ] [Question - who to ask or what to investigate]

---

## 10. Next Steps

- [ ] Model domain types for each service using `dmf:domain-modeling`
- [ ] Input: this document's §2 + §8, plus `01-domain-discovery.md` §6-8 (workflows, data structures, ubiquitous language)
- [ ] Output: `04-domain-model.md`
```
