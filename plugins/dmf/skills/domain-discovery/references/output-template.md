# Domain Discovery Document - Output Template

Use this template for the structured output of domain discovery.
Fill in each section. Mark unknowns with `???` or `TBD`. Leave no section empty -
if nothing is known yet, say so explicitly.

---

```markdown
# Domain Discovery: [System Name]

> Source: [interview transcript, requirements doc, conversation, etc.]
> Date: [date]
> Status: [Draft | Review | Approved]

---

## 1. Domain Overview

[2-3 paragraph summary of the business domain, who the users are, what problem
is being solved, and what the system does at the highest level. Written in
domain expert language, no technical terms.]

### Non-Functional Context

| Dimension | Value |
|-----------|-------|
| Users | [who uses the system] |
| Scale | [orders per day, users, etc.] |
| Traffic pattern | [steady / seasonal / spiky] |
| Latency requirements | [real-time / end-of-day / etc.] |
| User expertise | [beginner / expert / mixed] |
| Reliability | [cost of failure, SLA expectations] |
| Audit requirements | [yes/no, details] |

---

## 2. Bounded Contexts

### Context: [Context Name]
- **Classification**: Core / Supportive / Generic
- **Owner**: [team or department]
- **Responsibility**: [single sentence describing what this context does]
- **Key domain events**: [list of events this context produces]
- **Key commands**: [list of commands this context handles]

### Context: [Context Name]
- **Classification**: ...
- ...

[Repeat for each context]

---

## 3. Context Map

### Relationships

| Upstream | Downstream | Relationship | Notes |
|----------|------------|-------------|-------|
| [Context A] | [Context B] | Shared Kernel / Customer-Supplier / Conformist / ACL | [details] |

### Data Flow

[Describe what events flow between contexts and what data they carry.
Use arrows: Context A --OrderPlaced--> Context B]

```
[Context A] --"Order Placed"--> [Context B]
[Context A] --"Order Placed"--> [Context C]
[Context D] --"Product Price List"--> [Context A]
```

---

## 4. Domain Events

| Event | Past-tense name | Produced by | Consumed by | Data carried |
|-------|----------------|-------------|-------------|-------------|
| 1 | [Event name] | [Context] | [Context(s)] | [Brief description] |
| 2 | ... | ... | ... | ... |

---

## 5. Commands

| Command | Imperative name | Triggers workflow | Triggered by |
|---------|----------------|-------------------|-------------|
| 1 | [Command name] | [Workflow name] | [Event or actor] |
| 2 | ... | ... | ... |

---

## 6. Workflows

### Workflow: [Workflow Name]

**Bounded context**: [Context Name]

**Triggered by**: [Event or Command]

**Primary input**:
```
[Data structure name]
```

**Other inputs / dependencies**:
- [Dependency 1] - [what it provides]
- [Dependency 2] - [what it provides]

**Output events**:
- [Event 1] - sent to [Context]
- [Event 2] - sent to [Context]

**Side effects**:
- [Side effect 1, e.g., "Send acknowledgment email to customer"]

**Error outputs**:
- [Error 1, e.g., "Validation failed - invalid product codes"]

#### Substeps

##### Substep 1: [Name]
- **Input**: [Type]
- **Output**: [Type] OR [Error type]
- **Dependencies**: [External service or data]
- **Logic**:
  ```
  [Pseudocode - 3-10 lines describing business rules]
  ```

##### Substep 2: [Name]
- ...

[Repeat for each substep]

[Repeat Workflow section for each workflow in the target context]

---

## 7. Data Structures

### [Lifecycle Entity Name] (across stages)

```
data Unvalidated[Entity] =
    [Field1]
    AND [Field2]
    AND list of Unvalidated[Child]

data Validated[Entity] =
    Validated[Field1]
    AND Validated[Field2]
    AND list of Validated[Child]

data Priced[Entity] =
    Validated[Field1]
    AND Validated[Field2]
    AND list of Priced[Child]
    AND [NewFieldAtThisStage]
```

### Simple / Constrained Types

```
data [TypeName] = [primitive] [constraint description]
```

Examples:
```
data WidgetCode = string starting with "W" then 4 digits
data GizmoCode = string starting with "G" then 3 digits
data ProductCode = WidgetCode OR GizmoCode
data UnitQuantity = integer between 1 and 1000
data KilogramQuantity = decimal between 0.05 and 100.00
data OrderQuantity = UnitQuantity OR KilogramQuantity
data EmailAddress = string matching email format
data String50 = string, max 50 characters, non-empty
```

### Choice Types

```
data [TypeName] = [Case1] OR [Case2] OR [Case3]
```

### Records

```
data [TypeName] =
    [Field1]
    AND [Field2]
    AND [Field3] (optional)
    AND list of [ChildType]
```

---

## 8. Ubiquitous Language

| Term | Definition | Context | Notes |
|------|-----------|---------|-------|
| [Term] | [Definition in business language] | [Bounded context] | [Disambiguation, synonyms, etc.] |

---

## 9. Open Questions

- [ ] [Question 1] - [Who to ask / what to investigate]
- [ ] [Question 2]
- [ ] [Question 3]

---

## 10. Next Steps

- [ ] Resolve open questions with domain experts
- [ ] Begin type-level modeling of [target context] using `dmf:domain-modeling`
- [ ] Define simple/constrained types (C# by default, F# on request)
- [ ] Define types for each lifecycle stage
- [ ] Define workflow function types with explicit dependencies and effects
```

---

## Notes on Filling the Template

- **Prefer too much detail over too little.** Discovery documents are cheap to write
  and expensive to miss. A forgotten constraint discovered during implementation
  costs 10x more than capturing it now.

- **Mark every unknown.** `???` and `TBD` are valuable signals, not embarrassments.
  A document with 15 open questions is more useful than a document that papers
  over 15 assumptions.

- **Use domain expert words verbatim.** If the domain expert says "order acknowledgment,"
  write "order acknowledgment" - not "confirmation email" or "receipt notification."

- **Don't merge lifecycle stages.** UnvalidatedOrder and ValidatedOrder and PricedOrder
  are three separate entries, not one "Order" with flags. This is the single most
  important modeling decision in DMF.

- **Keep it readable by non-developers.** The domain expert should be able to review
  this document and correct it. If they can't understand it, you've leaked technical
  implementation into the discovery.
