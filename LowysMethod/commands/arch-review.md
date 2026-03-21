---
description: Review an existing architecture for compliance with Löwy's Method — layer placement, naming, Design Don'ts, and use case validation
argument-hint: <description of existing architecture or service list>
---

Review the following architecture against Löwy's Method: $ARGUMENTS

## Phase 1: Structural Review
Use the `/classify-structure` skill to:
- Verify each service is in the correct layer
- Check naming conventions (suffix, prefix type)
- Run the full Design Don'ts checklist (12 rules)
- Validate Managers-to-Engines ratio
- Run the expendability test on each Manager
- Run the cappuccino machine test on each claimed Utility
- Check for functional or domain decomposition smells

**Output:** A table of findings — each service with its current classification,
any naming violations, and any Don't violations.

## Phase 2: Use Case Validation
Use the `/validate-use-cases` skill to:
- Ask the user for 2–6 core use cases (or identify them)
- Produce call chains for each
- Check closed-architecture compliance in each chain
- Verify symmetry across chains
- Identify any use case that cannot be satisfied by the current services

**Output:** Call chains with per-chain verdicts.

## Phase 3: Summary Report
Produce a structured review report:

### Architecture Scorecard
- **Layer compliance:** ✅/⚠️/❌
- **Naming compliance:** ✅/⚠️/❌
- **Design Don'ts:** X violations found
- **Use case coverage:** X/Y core use cases validated
- **Symmetry:** ✅/⚠️/❌
- **Functional decomposition risk:** Low/Medium/High

### Recommended Actions
Prioritized list of changes, from most critical to least.
