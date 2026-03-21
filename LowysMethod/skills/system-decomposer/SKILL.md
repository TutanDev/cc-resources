---
name: system-decomposer
description: "Full system decomposition using Löwy's Method — from requirements to validated architecture. Use when explicitly invoked."
argument-hint: <system description or requirements>
disable-model-invocation: true
---

Execute a full Löwy's Method decomposition for the following system: $ARGUMENTS

Follow these phases in order, confirming with the user before advancing to each next phase:

## Phase 1: Decomposition
Use the `/list-volatilities` skill to:
- Identify core use cases (2–6)
- Apply axes of volatility
- Scrub for solutions masquerading as requirements
- Produce a volatilities list
- Map volatilities to candidate services

**Checkpoint:** Present the volatilities list and candidate services. Ask for confirmation.

## Phase 2: Structure
Use the `/classify-structure` skill to:
- Assign each candidate service to a layer using the Four Questions
- Apply naming conventions (PascalCase, correct suffix, correct prefix type)
- Run the Design Don'ts checklist
- Validate ratios (Managers-to-Engines golden ratio)
- Check expendability of each Manager

**Checkpoint:** Present the classified architecture table. Ask for confirmation.

## Phase 3: Validation
Use the `/validate-use-cases` skill to:
- Produce call chains for each core use case
- Check closed-architecture compliance
- Verify symmetry across call chains
- Validate non-core use cases with the same services

**Checkpoint:** Present call chains and verdict (✅/⚠️/❌). Ask for confirmation.

## Phase 4: Diagrams
Use the `/generate-diagram` skill to:
- Generate a layered architecture overview diagram
- Generate a call chain or sequence diagram for each core use case

Present all diagrams as final deliverables.
