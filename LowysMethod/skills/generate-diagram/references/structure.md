# Structure Reference

## Table of Contents
1. The Four Layers + Utilities Bar
2. Layer Definitions
3. The Four Questions
4. Naming Conventions
5. Key Observations
6. Open, Closed, and Semi-Closed Architectures
7. Relaxed Rules (Permitted Exceptions)
8. Design Don'ts (Violations)
9. Subsystems and Services

---

## 1. The Four Layers + Utilities Bar

The Method prescribes four horizontal layers plus a vertical Utilities bar:

```
┌──────────────────────────────────────────┐  ┌────────────┐
│  CLIENT LAYER                            │  │            │
│  Client A  │  Client B  │  Client C      │  │  Security  │
├──────────────────────────────────────────┤  │  Logging   │
│  BUSINESS LOGIC LAYER                    │  │  Diagnostics│
│  Manager A │  Manager B │  Manager C     │  │  Pub/Sub   │
│  Engine A  │  Engine B                   │  │  Message Bus│
├──────────────────────────────────────────┤  │  Hosting   │
│  RESOURCE ACCESS LAYER                   │  │            │
│  ResAccess A │  ResAccess B │ ResAccess C│  │            │
├──────────────────────────────────────────┤  │            │
│  RESOURCE LAYER                          │  │            │
│  Resource A  │  Resource B               │  │            │
└──────────────────────────────────────────┘  └────────────┘
```

---

## 2. Layer Definitions

### Client Layer
The topmost layer. Contains all consumers of the system — end-user applications, other systems, APIs, timers, schedulers. "Client" is preferred over "Presentation" because not all clients present information to humans. All Clients use the same entry points to the system and are subject to the same access security and data types. The Client layer encapsulates the volatility in *who* interacts with the system and *how* they present/consume information.

**Volatility profile:** Highest. Different platforms, devices, technologies, teams, lifecycles. Client volatility is independent of system behavior.

### Business Logic Layer — Managers
Managers encapsulate the volatility in the *sequence* (orchestration) of activities within use cases. A Manager owns a family of logically related use cases. It orchestrates Engines and ResourceAccess to execute workflows.

**Key properties:**
- Managers should be "almost expendable" — changing one should require thought and estimation, not fear or shrugging
- Managers may use zero or more Engines
- Managers may call ResourceAccess directly (especially when no Engine is needed)
- Most systems have 2–5 Managers
- A Manager can support multiple families of use cases via different service contracts (facets)

### Business Logic Layer — Engines
Engines encapsulate the volatility in *activities* (the "how" of business operations). They represent the Strategy pattern — interchangeable implementations of business rules, calculations, transformations, searches, validations.

**Key properties:**
- Engines are utilitarian — they have no independent meaning outside a use case
- Engines are designed for reuse across Managers
- If two Managers use different Engines for the same activity → missed activity volatility or functional decomposition
- Most systems have 2–3 Engines

### ResourceAccess Layer
Encapsulates the volatility in *how* a Resource is accessed and the volatility in the Resource itself. Exposes only **atomic business verbs** — the indivisible business-level operations (e.g., Credit, Debit in banking).

**Key properties:**
- Must NOT expose CRUD or I/O operations (Select, Insert, Open, Close, Read, Write)
- Must be Resource-neutral in its contract — changing the underlying Resource should not change the interface
- Designed for reuse across Managers and Engines
- If two consumers cannot share the same ResourceAccess for the same Resource → missed access volatility or incorrect atomic business verbs

### Resource Layer
Physical resources: databases, file systems, caches, message queues, external systems. A Resource may be a whole system in its own right but appears as just a Resource to your system.

**Volatility profile:** Lowest. Resources change at a glacial pace compared to everything above them.

### Utilities Bar
Vertical bar cutting across all layers. Contains infrastructure services needed by nearly every component: Security, Logging, Diagnostics, Instrumentation, Pub/Sub, Message Bus, Hosting.

**Litmus test ("cappuccino machine test"):** To qualify as a Utility, a component must plausibly be useful in any unrelated system — such as a smart cappuccino machine. Security? Yes (access control). Logging? Yes. Pub/Sub? Yes (low on coffee notification). Mortgage interest calculator? No. If it can't pass this test, it belongs in a layer, not the Utilities bar.

---

## 3. The Four Questions

The layers loosely map to four English questions:

| Question | Layer | Contains |
|----------|-------|----------|
| **Who** | Client | Who interacts with the system |
| **What** | Manager | What behavior the system provides (use case orchestration) |
| **How** (business) | Engine | How the system performs business activities |
| **How** (access) | ResourceAccess | How the system accesses Resources |
| **Where** | Resource | Where the system state resides |

**Usage for initiation:** When starting from scratch, bin all "who" candidates into Clients, all "what" into Managers, all "how" (business) into Engines, all "how" (access) into ResourceAccess, all "where" into Resources. The result won't be perfect but provides a starting point.

**Usage for validation:** After completing a design, check: Are all Clients purely "who" with no trace of "what"? Are all Managers purely "what" without "who" or "where" leaking in? Crossover between questions is permitted only when justified by volatility encapsulation.

**Note:** The mapping is loose — volatility trumps the questions. If there is no volatility in the "how," Managers can absorb both "what" and "how."

---

## 4. Naming Conventions

Service names must be **two-part compound words in PascalCase**: `[Prefix][TypeSuffix]`

| Type | Suffix | Prefix Rule | Good Examples | Bad Examples (Smell) |
|------|--------|-------------|---------------|----------------------|
| Manager | `Manager` | Noun describing encapsulated use case volatility | `AccountManager`, `MembershipManager`, `MarketManager` | `BillingManager` (gerund → functional), `ProcessManager` (verb) |
| Engine | `Engine` | Gerund (noun from verb + "ing") describing the activity | `CalculatingEngine`, `SearchEngine`, `RegulationsEngine` | `AccountEngine` (no activity indicator → domain decomposition) |
| ResourceAccess | `Access` | Noun associated with the Resource/data | `MembersAccess`, `PaymentsAccess`, `WorkflowsAccess` | `BillingAccess` (gerund → functional) |

**Rules:**
- Gerunds as prefixes belong *only* on Engines. Gerunds on Managers or ResourceAccess signal functional decomposition.
- Atomic business verbs (Credit, Debit, Transfer) belong in operation/method names on ResourceAccess contracts, never in service names.
- Good Engine activities: aggregate, adapt, strategize, validate, rate, calculate, transform, generate, regulate, translate, locate, search.

---

## 5. Key Observations

### Volatility Decreases Top-Down
Clients (most volatile) → Managers → Engines → ResourceAccess → Resources (least volatile). If the most-depended-upon components are also the most volatile, the system will implode.

### Reuse Increases Top-Down
Clients (least reusable) → Managers → Engines → ResourceAccess → Resources (most reusable). Lower-layer components serve more consumers.

### Almost-Expendable Managers
Three categories of Manager response to a change request:
- **Expensive** (fight the change, fear the cost) → Manager is too big, likely functional decomposition
- **Expendable** (shrug it off, trivial) → Manager is pass-through, design flaw, no real volatility encapsulated
- **Almost expendable** (contemplate, estimate, plan) → Correct. Manager orchestrates, encapsulates sequence volatility

### Managers-to-Engines Golden Ratio
| Managers | Expected Engines |
|----------|-----------------|
| 1 | 0–1 |
| 2 | 1 |
| 3 | 2 |
| 5 | 3 |
| 8+ | Likely functional decomposition |

A large number of Engines signals high activity volatility without corresponding use case volatility — suspicious.

### Order of Magnitude ~10
A well-designed system has approximately 10 services (order of magnitude): 2–5 Managers, 2–3 Engines, 3–8 ResourceAccess+Resources, ~6 Utilities. Total: roughly a dozen to two dozen building blocks. More than this → see §9 Subsystems.

---

## 6. Open, Closed, and Semi-Closed Architectures

### Open Architecture
Any component calls any other component regardless of layer. Maximum flexibility, zero encapsulation. In practice: useless layering.

### Closed Architecture (The Method's default)
- Call DOWN to the adjacent layer only.
- NEVER call UP.
- NEVER call sideways (within the same layer).

This maximizes decoupling by trading flexibility for encapsulation — the better trade.

### Semi-Closed
Allows calling more than one layer down. Justified only for:
1. Performance-critical infrastructure (e.g., network stack implementations)
2. Code that virtually never changes

Most business systems have neither constraint.

---

## 7. Relaxed Rules (Permitted Exceptions)

The Method relaxes strict closed architecture in specific, well-defined ways:

### Utilities Are Cross-Cutting
Any component in any layer may call any Utility. This is why Utilities sit in a vertical bar, not in a horizontal layer.

### Managers May Call ResourceAccess
Even though they're in the same layer (Business Logic), Managers may call ResourceAccess directly. A Manager with no Engines must still access Resources.

### Managers May Call Engines
Manager → Engine calls are not truly sideways. Engines are the Strategy pattern within a Manager's workflow — think of them as an orthogonal plane.

### Managers May Queue Calls to Other Managers
A Manager may queue (not directly call) another Manager. Two justifications:
1. **Technical:** The queued call goes down to ResourceAccess (the queue) and a queue listener Client calls down to the receiving Manager. No actual sideways call occurs.
2. **Semantic:** One use case triggering a deferred execution of another use case is natural in business systems (e.g., "save for end-of-month analysis").

**Constraint:** A Manager must not queue to more than one other Manager in the same use case. If two Managers need to respond → use Pub/Sub instead.

---

## 8. Design Don'ts (Violations)

Each of these is a red flag. Investigate any violation — it almost always reveals functional decomposition or missed volatility.

| # | Rule | Reason |
|---|------|--------|
| 1 | **Clients must not call multiple Managers in the same use case** | Implies Managers are coupled or Client is stitching functionalities together. Clients *can* call different Managers in *different* use cases. |
| 2 | **Clients must not call Engines** | Forces sequencing volatility into Clients, polluting them with business logic. Managers are the only entry points to the business layer. |
| 3 | **Managers must not queue to more than one Manager in the same use case** | If two, why not all? Use Pub/Sub instead. |
| 4 | **Engines must not receive queued calls** | Engines have no independent meaning. Executing an activity disconnected from any use case makes no business sense. |
| 5 | **ResourceAccess must not receive queued calls** | Same reasoning as Engines. Accessing a Resource independently makes no business sense. |
| 6 | **Clients must not publish events** | Events represent system state changes. Clients have no knowledge of system internals. If a Client needs to publish events, the Client *is* the system → functional decomposition. |
| 7 | **Engines must not publish events** | Engines perform activities without context of the overall use case state. Only Managers know when a state change is significant. |
| 8 | **ResourceAccess must not publish events** | ResourceAccess cannot know the significance of Resource state to the business. Managers should publish events as they modify state. |
| 9 | **Resources must not publish events** | Same as ResourceAccess. Business significance belongs in Managers. |
| 10 | **Engines, ResourceAccess, and Resources must not subscribe to events** | Processing an event starts a use case → must be done in a Client or Manager. |
| 11 | **Engines must never call other Engines** | Violates closed architecture and indicates functional decomposition. An Engine should fully encapsulate its activity. |
| 12 | **ResourceAccess must never call other ResourceAccess** | If verbs are truly atomic, one cannot require another. A single ResourceAccess should join multiple Resources if needed. |

---

## 9. Subsystems and Services

A **subsystem** is a vertical slice: a cohesive grouping of Manager(s) + Engine(s) + ResourceAccess + Resources that implements a corresponding family of use cases.

### When to Introduce Subsystems — Decision Sequence

1. **Exhaust flat decomposition first.** Apply volatility-based decomposition until you have found the smallest valid set of components. Do not reach for subsystems prematurely.
2. **Check against the flat-architecture ceiling.** A well-designed single-subsystem system has roughly a dozen to two dozen building blocks: 2–5 Managers, 2–3 Engines, 3–8 ResourceAccess/Resources, and ~6 Utilities.
3. **If the count cannot be reduced below that ceiling**, the excess signals that the system contains genuinely independent, value-delivering domains. At that point, partition into subsystems along use case family boundaries.

> **Key principle:** Subsystems are *not* a starting point — they *emerge* when the flat architecture can no longer contain the system's volatility in a manageable number of building blocks. When decomposition is done correctly, you will almost never need them.

### Structural Constraints

- **Limit Managers per subsystem to three.** This is the constraint that allows the total Manager count across the whole system to grow beyond the flat ceiling of ~5 — distributed across subsystems.
- **Avoid over-partitioning.** Most systems need only a handful of subsystems; resist the urge to partition early.
- **Each subsystem should stand alone** and deliver direct, independent business value — this also enables incremental delivery (one slice at a time).

### Strive for Symmetry
Well-designed architectures are symmetric. Call chains should look structurally similar across use cases. Asymmetry signals uneven decomposition or missed volatility.
