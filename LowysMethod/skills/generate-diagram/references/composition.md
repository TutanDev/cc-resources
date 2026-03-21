# Composition & Validation Reference

## Table of Contents
1. Design Prime Directive
2. Core Use Cases
3. Composable Design
4. Architecture Validation via Call Chains
5. Call Chain Notation
6. "There Is No Feature"
7. Handling and Containing Change

---

## 1. Design Prime Directive

**Never design against the requirements.**

This is counter to mainstream practice but logically unavoidable:
- Requirements change. That's what they do.
- Designing against requirements guarantees that when requirements change, the design must change.
- Architectural change is always expensive and often destructive.
- Therefore: any approach that ties design to current requirements guarantees future pain.

This does NOT mean ignore requirements. Requirements analysis is essential — but its purpose is to identify **core use cases** and **areas of volatility**, not to transcribe requirements into components.

---

## 2. Core Use Cases

In any system, most use cases are variations of a small number of essential behaviors. There are exactly two types of use cases:

**Core use cases:** The essence of the business. They represent what the system fundamentally *is*, not what it currently *does*. The nature of the business hardly ever changes, and neither do core use cases. All customers share them.

**Regular use cases:** Everything else. Variations, customizations, locale-specific behaviors, error paths, edge cases. These change frequently across customers and over time.

### Properties of Core Use Cases
- A system typically has **2–6** core use cases (rarely more).
- They are almost never stated explicitly in requirements docs — they are abstractions.
- They may require inventing new terminology to differentiate from regular use cases.
- Even a badly incomplete requirements spec will contain them, because they ARE the business.
- A single-page marketing brochure for the system typically has no more than 3 bullet points — those correspond roughly to core use cases.

### Finding Core Use Cases
1. Look at the system's one-sentence definition or mission statement. The core use case IS that sentence.
2. Review all provided use cases. Most will be simple functionalities that add little differentiation. The raison d'être of the system is the core use case.
3. Ask: "What makes this system different from a spreadsheet or manual process?" The answer points to the core use case.
4. Abstract groups of similar use cases. The abstraction is likely a core use case.
5. Work with the requirements owner iteratively — this is not a solo exercise.

### TradeMe Example
TradeMe's one-sentence definition: "a system for matching tradesmen to contractors and projects." Most provided use cases (Add Tradesman, Create Project, Pay Tradesman) were simple CRUD operations — not core. The single core use case: **Match Tradesman**. Everything else is a variation or supporting flow.

---

## 3. Composable Design

**The architect's mission:** Identify the **smallest set** of components that, when composed, can satisfy ALL core use cases.

Since regular use cases are variations of core use cases, they manifest as different interactions between the SAME components — not different components. When requirements change, you change the integration (Manager workflow code), not the architecture.

### Smallest Set
- Order of magnitude: ~10 components.
- A single monolith (1 component) is the "smallest" but worst design — internal complexity.
- One component per use case (e.g., 300 components) has maximum integration cost.
- The sweet spot: ~10, verified by combinatorics. Even 10 components yield astronomical possible combinations.
- Practically: 2–5 Managers + 2–3 Engines + 3–8 ResourceAccess/Resources + ~6 Utilities = roughly a dozen to two dozen.
- Once you cannot think of a smaller valid set, you've found your best design.
- If the smallest valid flat set still exceeds the ceiling, the excess is the trigger for subsystem partitioning — see structure.md §9.

### Duration of Design Effort
- Identifying core use cases + volatilities: weeks to months (this is requirements analysis, not design).
- Producing a valid architecture once those are settled: hours to days (order of magnitude: ~1 day).
- If architecture takes much longer, you may be trying to design against the requirements.

---

## 4. Architecture Validation via Call Chains

A design is **valid** if you can demonstrate that the composition of services supports every core use case. Validation is done by producing **call chain diagrams** or **sequence diagrams** for each core use case.

### Validation Process
1. Take each core use case.
2. Identify which services participate.
3. Draw the call chain: Client → Manager → Engine/ResourceAccess → Resource, with Utilities as needed.
4. Verify:
   - Every call respects closed-architecture rules (down only, with permitted relaxations).
   - No Design Don't violations.
   - The Manager is orchestrating, not the Client.
   - Events are published only by Managers (or Clients for UI purposes).
5. Check for symmetry: call chains across use cases should look structurally similar.
6. If you cannot produce a valid call chain, the design is incomplete — go back to decomposition.

### Validate ALL Provided Use Cases (Not Just Core)
Once you validate core use cases, also validate the non-core use cases. A well-decomposed system should support them all with the same components. If a regular use case cannot be satisfied → investigate whether a volatility was missed.

---

## 5. Call Chain Notation

### Call Chain Diagram
A simplified dependency graph superimposed on the layered architecture.

**Notation:**
- Solid arrow (→) = synchronous request/response call
- Dashed arrow (⇢) = queued/asynchronous call (through a message bus or queue)
- Components colored by layer: green=Client, yellow=Manager/Engine, gray=ResourceAccess, blue=Resource, purple=Utility

**Limitations:** No call ordering, no duration, confusing with many calls to the same component type.

### Sequence Diagram
UML-style sequence diagram with layer-colored lifelines and the same arrow conventions.

**Advantages:** Shows ordering, duration, multiple interactions with the same component.
**When to use:** Complex use cases, technical audiences, or when call order matters for validation.

### Swim Lane Activity Diagrams
Before drawing call chains, it's useful to first produce swim lane activity diagrams. Each swim lane represents an area of interest (roughly a subsystem). This helps identify which services participate in the use case and how the workflow distributes across them. Then map swim lanes to actual architecture components.

---

## 6. "There Is No Feature"

**Features are always and everywhere aspects of integration, not implementation.**

This is a universal design rule, not a software-specific principle:
- A car's "transportation" feature emerges from integrating chassis + engine + gearbox + wheels + road + driver + fuel. No single component IS "transportation."
- A laptop's "word processing" feature emerges from integrating keyboard + screen + CPU + memory + hard drive. There is no "Word Processing" box in the laptop architecture.
- This is fractal: drill into any component and its "feature" also emerges from integrating sub-components.

**Implication for architecture:** If you have a component named after a feature, you've done functional decomposition. Components encapsulate volatility; features emerge from their integration.

---

## 7. Handling and Containing Change

### Why Change Is Not the Enemy
Requirements change → the system must respond. Fighting change (deferring to next release, arguing against it) pushes customers to workarounds, competitors, or legacy systems. Fighting change kills the system.

### How The Method Contains Change
A change to a requirement = a change to a use case = a change to a Manager's workflow.

When a Manager changes:
- The Manager may need significant rework or even replacement.
- But the underlying Engines, ResourceAccess, Resources, Utilities, and Clients are NOT affected.
- You salvage and reuse ALL the effort invested in those layers.
- You re-integrate the existing services through the new Manager workflow.

This is why Managers must be "almost expendable" — they are the designated absorbers of change.

### Cost Distribution
The bulk of implementation effort goes into:
- Engines (complex business rules)
- ResourceAccess (atomic business verbs, Resource-neutral interfaces)
- Resources (scalability, reliability, performance, schemas, transactions)
- Utilities (security, diagnostics, hosting — must be world-class)
- Clients (UX, API design)

Managers are the smallest investment. Discarding and rebuilding a Manager to accommodate change is a contained, affordable operation. That is the essence of architectural agility.
