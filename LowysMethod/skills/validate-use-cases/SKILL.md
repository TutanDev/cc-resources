---
name: validate-use-cases
description: >
  Validate a layered architecture against core use cases by producing call chains.
  Use when the user has a proposed architecture (services assigned to layers) and needs to
  prove it supports the required behavior. Trigger on: "validate architecture", "call chain",
  "does this design support", "core use cases", "use case validation", "composable design",
  "prove the architecture", "test the design", or any request to verify that a set of services
  can satisfy a set of use cases. Also trigger when the user asks how a specific use case
  flows through the architecture — that is a call chain request.
---

# Architecture Validation via Call Chains

**Read** `references/composition.md` before validating.

You are helping the user prove that their architecture supports every core use case.
Validation is done by producing **call chains** — the sequence of service interactions
that implement each use case.

## Workflow

### Step 1: Identify Core Use Cases
If the user hasn't already identified them:
- A system typically has **2–6** core use cases
- They represent what the system fundamentally *is*, not what it currently *does*
- They are rarely stated explicitly in requirements — they are abstractions
- Ask: "What makes this system different from a spreadsheet?" The answer points to the core use case
- A single-page marketing brochure for the system typically has ≤3 bullet points — those are roughly the core use cases

### Step 2: Produce Call Chains for Each Core Use Case
For each core use case:
1. Identify which services participate
2. Trace the flow: Client → Manager → Engine/ResourceAccess → Resource (with Utilities as needed)
3. Verify at each step:
   - Every call respects closed-architecture rules (down only, permitted relaxations only)
   - The Manager is orchestrating, not the Client
   - Events are published only by Managers (or Clients for UI-local purposes only)
   - No Design Don't violations

### Step 3: Check for Symmetry
Call chains across different use cases should look structurally similar:
- Same layers involved in similar order
- Similar depth of call nesting
- Asymmetry signals uneven decomposition or missed volatility

### Step 4: Validate Non-Core Use Cases
Once core use cases validate, check the remaining use cases:
- They should be satisfiable with the **same** set of services
- Different use cases = different Manager workflow code, not different services
- If a regular use case cannot be satisfied → a volatility was missed → go back to decomposition

### Step 5: Verify "There Is No Feature"
For each service in the architecture:
- Can you describe it WITHOUT naming a feature? If not → functional decomposition
- Does any single service "own" a feature? If yes → the feature should emerge from integration

### Step 6: Assess Change Containment
For each core use case, simulate a requirement change:
- "What if the customer wants to change X about this use case?"
- The change should be containable within a Manager's workflow
- Engines, ResourceAccess, Resources, Utilities, Clients should NOT need to change
- If the change propagates beyond the Manager → decomposition problem

## Output Format

For each core use case, produce:

**Use Case:** _name_
**Call Chain:**
```
Client(X) → Manager(Y) → Engine(Z) → ResourceAccess(W) → Resource(V)
                       → ResourceAccess(W2) → Resource(V2)
```
**Violations:** _none / list_
**Symmetry notes:** _comparison with other chains_

Then a summary verdict:
- ✅ Architecture validates — all core use cases supported
- ⚠️ Partial — use cases X, Y need investigation
- ❌ Invalid — use case X cannot be satisfied, missing volatility: _description_

## Key Principle

> **Never design against the requirements. Design against the core use cases.**
>
> Requirements change. Core use cases almost never do. If your architecture
> supports the core use cases via composable services, requirement changes
> manifest as different Manager workflow code — not architectural change.
