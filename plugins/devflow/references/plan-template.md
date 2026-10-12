# Plan: <Feature Title>

> Source: <the request in one line>; <design files>; <`.claude/docs/architecture.md` if it exists>
> Status: draft
> Revision: 1, <YYYY-MM-DD>

## 1. Goal

<What the feature does, for whom, and how anyone will know it works, in two to five sentences.>

## 2. Scope

**In scope**

- <...>

**Out of scope**

- <...>

## 3. Use Cases

### UC-1: <name>

- **Trigger:** <actor or event>
- **Steps:** <main path>
- **Outcome:** <what is true when it succeeds>
- **Failures:** <each failure, and what the user sees>

## 4. Architecture Impact (Löwy)

### 4.1 Services

| Service | Layer | Change | File | Why |
|---|---|---|---|---|
| <name> | <Client, Manager, Engine, ResourceAccess, Utility> | <new, changed, called> | <path, for an existing service> | <reason> |

### 4.2 Volatility

<The axis of volatility the feature falls on, and the service that encapsulates it; or the new axis, and the service that will encapsulate it.>

### 4.3 Call Chains

**UC-1**

| Hop | Caller | Callee | Kind |
|---|---|---|---|
| 1 | <Client> | <Manager.Operation> | <sync, queued, event> |

### 4.4 Messaging

<New or changed commands and events, with publisher and subscribers; or "No messaging changes.">

## 5. Domain Model Impact (DMF)

### 5.1 Types

```csharp
// <type sketch>
```

<The illegal state each type rules out.>

### 5.2 Workflows

```csharp
// <signature with its effects and dependencies>
```

### 5.3 Errors

<The cases of the domain error union, one for each failure in §3.>

### 5.4 Boundaries

<DTOs, persistence changes and versioning; or "No boundary changes.">

## 6. Phases

### Phase 1: <name>

- **Goal:** <what works after this phase that did not before>
- **Depends on:** none
- **Changes:** <services, types and files, citing §4 and §5>
- **Acceptance criteria:**
  - `AC-1.1` <observable, checkable statement>
- **Tests:** <tests, their kind, and what each proves>
- **Status:** pending

## 7. Verification

### 7.1 Commands

```
<build command>
<test command>
```

### 7.2 Scenarios

1. **<scenario name>** (UC-1): <setup>; <steps>; <the result to observe>.

## 8. Risks, Assumptions and Open Questions

### Risks

- <risk>: <mitigation>

### Assumptions

- <assumption the writer made, and why>

### Open Questions

- `Q-1` <question>
  - **Options:** <a>; <b>
  - **Recommendation:** <a>, because <reason>
  - **Depends on it:** <sections or phases>

## 9. Decision Log

<Review rounds and user decisions are appended here.>
