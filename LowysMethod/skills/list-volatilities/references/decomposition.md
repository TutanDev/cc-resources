# Decomposition Reference

## Table of Contents
1. Why Functional Decomposition Fails
2. Why Domain Decomposition Fails
3. Volatility-Based Decomposition
4. Axes of Volatility
5. Solutions Masquerading as Requirements
6. Volatile vs Variable
7. The Volatilities List Process
8. From List to Architecture
9. Resist the Siren Song

---

## 1. Why Functional Decomposition Fails

Functional decomposition maps system requirements directly to services (e.g., "the system does invoicing" → `InvoicingService`). This approach has severe structural problems:

**Coupling to requirements.** Services mirror what the system does today. Any change in required functionality forces architectural change — the exact outcome architecture should prevent.

**Precludes reuse.** Functional services encode temporal ordering (A then B then C). Service B assumes A ran before it and C runs after. Lifting B into another system fails because A and C are baked into its assumptions. A, B, and C form a clique, not independent reusable services.

**Explosion or bloat.** Either you create one service per functional variation (hundreds of services, massive integration cost) or you lump variations into mega-services (god monoliths, impossible to maintain).

**Client bloat.** Clients must orchestrate functional services in the correct order, becoming the de facto system. Business logic migrates into the Client, coupling Clients to service internals.

**Change maximization.** Because components map to current functionality, any requirement change propagates across multiple components. Functional decomposition *maximizes* the blast radius of change. This is the primary reason to reject it.

### When Functional Decomposition Is Acceptable
Only for throwaway prototypes or systems with a guaranteed short lifespan where maintenance cost is irrelevant. Never for production systems expected to evolve.

---

## 2. Why Domain Decomposition Fails

Domain decomposition maps the business domain to services (e.g., `CustomerService`, `OrderService`, `ProductService`). This is functional decomposition wearing a domain hat.

The same structural problems apply: domain entities couple services to current business structure, domain boundaries shift as the business evolves, and cross-cutting concerns bleed across domain boundaries. The "domain house" analogy: decomposing a house into `KitchenService`, `BedroomService`, `BathroomService` produces components that cannot be reused, cannot absorb change, and create god services that dump all related functionality into a single bucket.

---

## 3. Volatility-Based Decomposition

**The Method's design directive: Decompose based on volatility.**

Volatility-based decomposition identifies areas of potential change and encapsulates each behind a service boundary. Required behavior is then implemented as interactions between these encapsulated areas.

**The vault metaphor.** Think of each service as a vault. A change (hand grenade) is tossed into the appropriate vault and the door closes. The vault's contents may be destroyed, but no shrapnel escapes to damage other services.

**Contrast with functional decomposition:** Functional components map to current behavior, so a change affects multiple components by definition. Volatility-based components map to *what could change*, so a change is contained within a single vault.

**Universal principle.** This is not software-specific. All well-designed systems — biological, mechanical, electrical — encapsulate volatility. Your body performs programming by integrating encapsulated volatilities (heart, lungs, hands, eyes) rather than having a dedicated "programming organ." The power receptacle in a house encapsulates enormous electrical volatility (AC/DC, voltage, frequency, source) behind a uniform interface.

**What is encapsulated can be functional in nature** but is almost never domain-functional. Power in a house is functional (it powers things) but not domain-specific (not about the family's lifestyle). Valid volatilities tend to be cross-cutting infrastructure concerns or genuinely open-ended variation points.

---

## 4. Axes of Volatility

There are exactly two axes along which a system faces change:

**Axis 1 — Same customer over time.** Even if the system perfectly fits a customer today, that customer's needs will evolve. What will they want to change next year? In five years?

**Axis 2 — Different customers at the same time.** Freeze time and examine your customer base. Are all customers using the system identically? What differs between them right now?

### How to Use the Axes

Iteratively factor the design:
1. Start with one big component (the whole system).
2. Ask: "Can this serve one customer forever without change?" If no → identify what changes over time → encapsulate it → factor out a new service.
3. Ask: "Can this serve all customers identically right now?" If no → identify what differs across customers → encapsulate it → factor out a new service.
4. Repeat until all variation points along both axes are encapsulated.

### Independence of the Axes

The axes should be mostly independent. Something volatile along one axis should be relatively stable along the other. If an area of change cannot be isolated to one axis, investigate whether you're doing functional decomposition in disguise.

### Framing Interview Questions

When gathering requirements, phrase questions in terms of the axes:
- "Will this aspect of the system change for the *same* customer over time?"
- "Do *different* customers need this to work differently right now?"

If something maps to neither axis, it probably should not be a separate service.

---

## 5. Solutions Masquerading as Requirements

Requirements specs are full of solutions pretending to be requirements. This is a primary source of functional decomposition.

**The cooking example:**
- Requirement spec says: "The house must support cooking."
- Cooking is actually a *solution* for the requirement of feeding occupants.
- Feeding is still a solution — what about dieting, fasting?
- The real requirement: the house must support occupant well-being.
- The volatility to encapsulate: well-being, not cooking.

**Analysis technique:**
1. Take each stated requirement.
2. Ask: "Are there other possible solutions to this need?" If yes → it's a solution masquerading as a requirement.
3. Ask: "What is the underlying need?" → That's closer to the real requirement.
4. Repeat until you can't generalize further without losing meaning.
5. The final generalized requirement reveals the volatility to encapsulate.

**Common signals:**
- "Send an email after X" → Notification volatility (email is just one transport)
- "Store in a database" → Storage/persistence volatility (database is one option)
- "Display on a web page" → Client/presentation volatility
- "Calculate the price using formula X" → Calculation/pricing volatility

---

## 6. Volatile vs Variable

Not everything that changes is volatile at the architectural level.

**Volatile:** Open-ended variation that, if not encapsulated in an architectural component, would be very expensive to contain. Changes would have ripple effects across the system. Architecture must address this.

**Variable:** Variation easily handled with conditional logic, configuration, or parameterization within existing code. No architectural encapsulation needed.

**Rule of thumb:** If a change can be absorbed by an `if/else` or a config file, it's variable. If it requires a new service, a new integration pattern, or restructuring of call flows, it's volatile.

---

## 7. The Volatilities List Process

Before committing to any architectural design, compile a volatilities list.

**Process:**
1. Gather requirements (use cases, interviews, domain analysis).
2. For each stated requirement, apply the axes of volatility.
3. Scrub for solutions masquerading as requirements.
4. Apply the volatile-vs-variable filter.
5. For each identified volatility, document:
   - What the volatility is
   - Why it's volatile (which axis, what evidence)
   - What the encapsulation boundary should be
6. Do NOT commit to architecture yet. The list is a thinking tool.

**Duration:** The volatilities list may take weeks. The actual architecture takes hours to days once the list is solid.

**Example volatilities from a trading system:**
- User type volatility (traders, end customers, admins → different access, different auth)
- Client application volatility (desktop, web, mobile → different tech, lifecycles)
- Security volatility (domain auth vs. federated vs. username/password)
- Notification volatility (email, SMS, fax, paper letter — transport is volatile)
- Storage volatility (local DB, cloud, cache, distributed hash table)
- Connection/synchronization volatility (sync, async, queued, out-of-order)
- Duration/device volatility (single-session vs. long-running multi-device)
- Trade item volatility (stocks, bonds, currencies, commodities)
- Workflow volatility (different processing steps per trade type)
- Locale/regulation volatility (different countries, tax rules, compliance)
- Market feed volatility (Bloomberg, Reuters, internal simulation)

---

## 8. From List to Architecture

The mapping from volatilities list to services is rarely 1:1.

- A single service may encapsulate multiple related volatilities.
- Some volatilities map to operational concepts (queuing, event publishing) rather than distinct services.
- Some volatilities may be handled by third-party services.

**Strategy:** Start with the simple, obvious mappings. Each decision constrains the system, making subsequent decisions easier. Use abstract names that don't betray implementation (e.g., "Storage" not "Database"; "Notification" not "EmailService").

---

## 9. Resist the Siren Song

After investing effort in volatility-based decomposition, you will encounter strong pressure to revert to functional decomposition:
- Stakeholders present requirements functionally ("we need a billing module").
- Developers find it faster to map requirements directly to code.
- Deadlines create urgency that rewards shortcuts.

**Counter-measures:**
- Educate stakeholders on the long-term cost of functional decomposition.
- The Dunning-Kruger effect means managers unfamiliar with architecture will underestimate the complexity and time required.
- Gaining time to decompose correctly is often as hard as the decomposition itself. Expect organizational resistance.
- "Design for your competitors" — even if your current system doesn't need a volatility encapsulated, your competitor's system will. Designating a component costs near-zero; implementing it is a separate decision.
