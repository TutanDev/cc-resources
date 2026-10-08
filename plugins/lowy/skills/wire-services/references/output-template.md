# Service Wiring - Output Template

When completing the wiring phase, produce a markdown file following this template.
Save the file as `07-service-wiring.md` in the design directory `.claude/docs/design/<topic>/`.

This file is consumed by Phase 8 (`dmf-serialization-persistence`) and by
implementation teams. It defines all inter-service communication patterns.

---

```markdown
# Service Wiring: [System Name]

> Source: [link to 03-layered-architecture.md] + [link to 05-call-chains.md] + [link to 04-domain-model.md, if used]
> Date: [date]
> Status: [Draft | Review | Approved]

---

## 1. Communication Level Assessment

### Decision Factors

| Factor | Assessment | Notes |
|---|---|---|
| System complexity | Low / Medium / High | [evidence] |
| Number of subsystems | [n] | [list] |
| Team infrastructure maturity | Low / Moderate / High | [evidence] |
| Long-running workflows present? | Yes / No | [which workflows] |
| Extensibility requirements | Low / Medium / High | [evidence] |
| Number of Client types | [n] | [list] |

### Recommended Level

**Level [1/2/3]: [Direct / Queued / Message Bus]**

[2-3 sentence justification for this choice. Reference the decision factors above.]

If Level 1 or 2 with future upgrade path:
> **Upgrade trigger:** When [specific condition], reassess for Level [N+1].

---

## 2. Wiring Table

Every inter-service communication path in the system.

| # | From | From Layer | To | To Layer | Pattern | Direction | Justification |
|---|---|---|---|---|---|---|---|
| 1 | [Service] | Client | [Service] | Manager | sync / queued / pub-sub | → / ⇢ / ⇝ | [why this pattern] |
| 2 | [Service] | Manager | [Service] | Engine | sync | → | [standard call-down] |
| 3 | [Service] | Manager | [Service] | Manager | queued | ⇢ | [deferred triggering] |

**Legend:**
- `→` Synchronous request/response
- `⇢` Queued / asynchronous (through queue or bus)
- `⇝` Pub/Sub event (fire-and-forget, multiple subscribers)

---

## 3. Event Catalog

All events published and subscribed to in the system.

| # | Event Name | Published By | Layer | Subscribers | Payload Summary |
|---|---|---|---|---|---|
| 1 | [EventName] | [Service] | Manager | [Service(s)] | [Key data carried] |
| 2 | [EventName] | [Service] | Manager | [Service(s)] | [Key data carried] |

---

## 4. Constraint Compliance

### Permitted Patterns (verified)

| Pattern | Instances | Status |
|---|---|---|
| Client → Manager | [count] | ✅ |
| Manager → Engine | [count] | ✅ |
| Manager → ResourceAccess | [count] | ✅ (relaxation) |
| Manager → Manager (queued) | [count] | ✅ |
| Manager publishes events | [count] | ✅ |
| Client/Manager subscribes to events | [count] | ✅ |

### Prohibited Patterns (verified absent)

| Pattern | Status |
|---|---|
| Client ↔ Client | ✅ Not present |
| Engine ↔ Engine | ✅ Not present |
| ResourceAccess ↔ ResourceAccess | ✅ Not present |
| Client publishes system state events | ✅ Not present |
| Engine publishes/subscribes events | ✅ Not present |
| ResourceAccess publishes/subscribes events | ✅ Not present |

---

## 5. Per-Use-Case Wiring

For each core use case, the specific communication flow with patterns annotated.

### Use Case 1: [Name]

```
[Client] →(sync)→ [Manager]
                    →(sync)→ [Engine]
                               →(sync)→ [ResourceAccess] →(sync)→ [Resource]
                    →(sync)→ [ResourceAccess] →(sync)→ [Resource]
                    ⇝(pub)⇝ [EventName] → [Subscriber Manager]
```

**Latency-critical path:** [Yes/No - if yes, identify which steps]
**Failure handling:** [Sync errors bubble up / Queued: retry with backoff / Pub-Sub: at-least-once]

### Use Case 2: [Name]

[Repeat]

---

## 6. DTO Boundaries

Every point where data crosses a service boundary requires a DTO.
This section feeds Phase 8 (`dmf-serialization-persistence`).

| # | Boundary | From Service | To Service | Direction | DTO Name | Domain Type Source |
|---|---|---|---|---|---|---|
| 1 | [description] | [Service] | [Service] | Request | [DtoName]Request | [DomainType from 04-domain-model.md] |
| 2 | [description] | [Service] | [Service] | Response | [DtoName]Response | [DomainType from 04-domain-model.md] |
| 3 | [description] | [Service] | [Event subscriber] | Event payload | [EventName]Dto | [DomainType] |

---

## 7. Open Questions

- [ ] [Question - who to ask or what to investigate]

---

## 8. Next Steps

- [ ] Implement serialization and persistence using `dmf-serialization-persistence`
- [ ] Input: `04-domain-model.md` + this document's §6 (DTO Boundaries) + §3 (Event Catalog)
- [ ] Output: `08-serialization-bridge.md`
```
