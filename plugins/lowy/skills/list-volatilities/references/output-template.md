# Volatility Decomposition - Output Template

When completing the decomposition phase, produce a markdown file following this template.
Save the file as `02-volatilities.md` in the design directory `.claude/docs/design/<topic>/`.

This file is consumed by Phase 3 (`classify-structure`) and Phase 5 (`validate-use-cases`).

---

```markdown
# Volatility Decomposition: [System Name]

> Source: [link to 01-domain-discovery.md or requirements source]
> Date: [date]
> Status: [Draft | Review | Approved]

---

## 1. System Summary

[1-2 sentences. What this system is. Copied or distilled from the domain discovery document.]

---

## 2. Core Use Cases

These are the essential behaviors that define what this system *is*, not what it currently *does*.
Each core use case is an abstraction - it survives requirement changes.

| # | Core Use Case | Description | Surviving requirement changes? |
|---|---|---|---|
| 1 | [Name] | [1 sentence] | [Why this is core, not a feature] |
| 2 | [Name] | [1 sentence] | [Why this is core] |

Target: 2–6 core use cases. If you have more, some are likely features, not core.

---

## 3. Axes of Volatility

For each identified volatility:

| # | Volatility | Axis | Evidence | Volatile vs Variable | Encapsulation Boundary |
|---|---|---|---|---|---|
| 1 | [Name] | Same customer over time / Different customers / Both | [Concrete evidence of change] | Volatile - requires arch boundary | [Scope of what this service owns] |
| 2 | [Name] | ... | ... | Variable - config/parameterization | N/A (no service needed) |

**Axis 1 (same customer over time):** Will this change for the same customer? What will they want differently next year?
**Axis 2 (different customers at the same time):** Do different customers need this to work differently right now?

---

## 4. Solutions Masquerading as Requirements

Requirements that embed a specific solution. Generalize each to the underlying volatility.

| Stated Requirement | Hidden Solution | Underlying Volatility | Generalized Need |
|---|---|---|---|
| "Send email on order confirmation" | Email as notification channel | Notification mechanism | "Notify customer of order confirmation" |
| "Store orders in SQL Server" | SQL Server as persistence | Storage technology | "Persist order state durably" |

If none found, state: "No solutions masquerading as requirements detected."

---

## 5. Candidate Services

Each volatility maps to one or more candidate services. Services use abstract names - no implementation technology in the name.

| # | Candidate Service | Volatilities Encapsulated | Abstract Responsibility | Notes |
|---|---|---|---|---|
| 1 | [AbstractName] | [V#, V#] | [What this service hides from the rest of the system] | [Flags, open questions] |
| 2 | [AbstractName] | [V#] | ... | ... |

**Target:** Order of magnitude ~10 services total across all layers.

---

## 6. Decomposition Validation

- [ ] No service is named after a feature (functional decomposition check)
- [ ] No service is named after a domain entity (domain decomposition check)
- [ ] Every service can be described without referencing a specific requirement
- [ ] Every service encapsulates something that could genuinely change independently
- [ ] All core use cases can plausibly be satisfied by composing these services
- [ ] Service count is within expected range (~10, order of magnitude)

### Red Flags

[List any decomposition concerns, unresolved tensions, or items needing further analysis.
If none: "No red flags detected."]

---

## 7. Open Questions

- [ ] [Question - who to ask or what to investigate]

---

## 8. Next Steps

- [ ] Classify candidate services into layers using `classify-structure`
- [ ] Input: this document's §5 (Candidate Services) + §2 (Core Use Cases)
- [ ] Output: `03-layered-architecture.md`
```
