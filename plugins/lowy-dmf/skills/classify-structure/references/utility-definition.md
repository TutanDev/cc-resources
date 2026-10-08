# Utility vs Infrastructure - Classification Guide

> Based on Juval Löwy's "Righting Software" and The Method (IDesign).
> This document is intended as context for a Claude Code session to enforce correct classification of components.

---

## What Is a Utility in The Method?

In Löwy's layered architecture, the system is organized into horizontal layers: Clients → Managers → Engines → ResourceAccess → Resources. Each layer has strict rules about who can call whom (closed architecture).

A **Utility** is a special category of service that lives in a **vertical bar** on the side of the architecture, cutting across all layers. This vertical placement exists because Utilities cannot be placed in any single horizontal layer without breaking closed architecture rules. For example, if Logging were placed at the Manager level, only Clients could call it. If placed at the Resource level, Managers couldn't use it. The vertical bar solves this: **any component in any layer may call any Utility**.

Utilities are **common infrastructure services that nearly all systems require to operate**. Canonical examples from Löwy include: Security, Logging, Diagnostics, Instrumentation, Pub/Sub, Message Bus, and Hosting.

---

## The Cappuccino Machine Litmus Test

Löwy provides a single, decisive litmus test for whether a component qualifies as a Utility:

> **"Can the component plausibly be used in any other system, such as a smart cappuccino machine?"**

The test works as follows:

- A cappuccino machine could use **Security** to check if the user can drink coffee. → **Valid Utility.**
- A cappuccino machine could use **Logging** to record how much coffee office workers drink. → **Valid Utility.**
- A cappuccino machine could use **Pub/Sub** to publish an event that it's running low on coffee. → **Valid Utility.**
- A cappuccino machine has **no plausible use** for a mortgage interest calculation service. → **Not a Utility.** That is domain-specific business logic (an Engine).

The key insight: a Utility must be **domain-agnostic**. It encapsulates infrastructure-level volatility that is orthogonal to any specific business domain. If a component only makes sense within the context of your particular system's domain, it is not a Utility - it belongs in the layered architecture as a Manager, Engine, or ResourceAccess.

---

## Why This Distinction Matters

Löwy explicitly warns that developers **abuse the utilities bar** by labeling components as Utilities when they really want to short-circuit the closed architecture and allow cross-layer access. This is a form of architectural cheating. Misclassifying a domain-specific component as a Utility:

1. **Breaks encapsulation** - the component becomes callable from every layer, coupling it to everything.
2. **Hides functional decomposition** - it disguises what should be an Engine or Manager behind a Utility label.
3. **Undermines the layered architecture** - the entire point of the closed architecture is to constrain coupling. The Utility bar is a controlled exception, not an escape hatch.

---

## Utility vs Functional Library (Infrastructure Code)

A **functional library** (e.g., extension methods, math helpers, collection utilities, Result types, guard clauses) is **not a Utility in the Löwy sense**. Here is how to distinguish them:

| Criterion | Utility (Löwy) | Functional Library / Infrastructure |
|---|---|---|
| **Is a service** | Yes - has its own contract, lifecycle, and can be deployed independently | No - it is compiled code linked at build time |
| **Encapsulates volatility** | Yes - encapsulates infrastructure volatility (e.g., how logging is done, what auth provider is used) | No - provides static, deterministic helpers with no meaningful volatility |
| **Passes the cappuccino test** | Yes - any system could plausibly need it | May pass the test superficially, but it is not a service; it is a code dependency |
| **Cross-layer calling semantics** | Called as a service from any layer via the vertical bar | Referenced as a project/package dependency; has no architectural layer placement |
| **Has state or side effects** | Typically yes (writes logs, checks auth, publishes events) | Typically no (pure functions, data transformations) |
| **Architectural significance** | Appears on the architecture diagram as a named box in the Utility bar | Does not appear on the architecture diagram; it is an implementation detail |

A functional library like `FunctionalExtensions`, `Result<T>`, or `Guard` is best understood as **shared implementation infrastructure** - analogous to the language runtime or a NuGet package. It is not a service, it does not encapsulate a volatile area, and it does not participate in the architectural topology. It should **not** be placed in the Utility bar.

---

## Decision Flowchart

When classifying a component, apply this sequence:

1. **Is it a service with its own contract and lifecycle?**
   - No → It is a library/infrastructure dependency, not a Utility. Stop here.
   - Yes → Continue.

2. **Does it encapsulate a volatile area of infrastructure concern?**
   - No → It may be a Manager, Engine, or ResourceAccess depending on what it does. Not a Utility.
   - Yes → Continue.

3. **Does it pass the cappuccino machine test?** (Could any arbitrary, unrelated system plausibly need this?)
   - No → It is domain-specific. Classify it as a Manager, Engine, or ResourceAccess.
   - Yes → **It is a Utility.** Place it in the vertical bar.

---

## Examples Applied to Unity/XR Codebases

| Component | Classification | Reasoning |
|---|---|---|
| Logging service | **Utility** | Any system needs logging. Encapsulates how/where logs are written. |
| Pub/Sub event bus | **Utility** | Any system can benefit from decoupled eventing. |
| Auth/Security service | **Utility** | Any system may need to authenticate users. |
| `Result<T>` / `Option<T>` types | **Not a Utility** - library code | No service boundary, no volatility, pure data types. |
| Extension methods on collections | **Not a Utility** - library code | Static helpers, no service lifecycle. |
| Guard / validation helpers | **Not a Utility** - library code | Compile-time dependency, no volatility encapsulation. |
| Video codec selection engine | **Not a Utility** - Engine | Domain-specific (video streaming), encapsulates activity volatility in how encoding is done. |
| XR input abstraction | **Not a Utility** - could be Manager or Engine | Specific to XR systems; a cappuccino machine has no use for hand tracking. |
| Diagnostics / performance telemetry | **Utility** | Any system could use telemetry. Encapsulates how metrics are collected and shipped. |

---

## Summary for Claude Code Context

When reviewing or generating code in this codebase:

- **Do not** classify functional libraries, helper classes, or extension method collections as Utilities.
- **Do** classify cross-cutting infrastructure services (Logging, Security, Pub/Sub, Diagnostics, Message Bus) as Utilities.
- A Utility is always a **service** - it has a contract, encapsulates volatile infrastructure behavior, and is architecturally significant.
- Apply the **cappuccino machine test** as the primary litmus test when in doubt.
- If a component fails the test, it belongs in the layered architecture (Manager, Engine, ResourceAccess) or is simply a shared code library with no architectural standing.
