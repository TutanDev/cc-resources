# Elicitation Techniques & Interview Patterns

## Questioning Patterns from DMF

These are the questioning techniques demonstrated in the book's domain expert
interviews. Use them when conducting discovery with a user who is acting as
(or relaying information from) a domain expert.

### Event Discovery Questions

Start broad, then drill:

1. **"What triggers this process?"**
   → Finds the initiating event

2. **"What happens when [event] occurs?"**
   → Reveals the workflow steps

3. **"And then what?"** (repeat)
   → Walks through the full workflow sequentially

4. **"What happened before [leftmost event]? Where does it come from?"**
   → Extends the event chain upstream (edge expansion)

5. **"Are there any possible events after [rightmost event]?"**
   → Extends the event chain downstream (edge expansion)

6. **"Who else needs to know when [event] happens?"**
   → Reveals downstream consumers and missing bounded contexts
   → The billing department example: "Don't forget about us!"

7. **"Are there events that happen on a schedule rather than in response to something?"**
   → Catches time-based triggers (month-end close, daily batch, etc.)

### Constraint Discovery Questions

8. **"How can you tell if [value] is wrong?"**
   → Reveals validation rules and constraints

9. **"What are the limits? Can [quantity] be zero? Negative? Billions?"**
   → Finds numeric bounds

10. **"It depends on what?"**
    → When the expert says "it depends" - this always reveals choice types
    → Example: "Quantity is whole number or decimal?" → "It depends on product type"

11. **"Does [code/value] have a specific format?"**
    → Reveals pattern constraints (WidgetCode = W + 4 digits)

12. **"Are there any other types of [thing]? Or likely to be soon?"**
    → Tests whether a choice type is closed/stable or likely to change

### Lifecycle Discovery Questions

13. **"How can you tell [things at different stages] apart?"**
    → Reveals lifecycle markers - Ollie's "marks on the form"
    → Directly leads to separate types per stage

14. **"Do you ever accidentally mix up [processed] with [unprocessed]?"**
    → Probes whether stages need to be type-safe (they almost always do)

15. **"At this point, does the [entity] have a [field] yet?"**
    → Reveals which fields appear at which lifecycle stage
    → Example: "Does an unvalidated order have a price?" → "No, only after pricing"

### Dependency Discovery Questions

16. **"Where do you get [information] from?"**
    → Reveals external dependencies and other bounded contexts

17. **"Could you do this if [other department/system] were unavailable?"**
    → Tests autonomy requirements
    → Ollie's product catalog: "I don't want my job interrupted because someone else isn't available"

18. **"Is [reference data] always available or do you keep your own copy?"**
    → Reveals caching/autonomy patterns

### Priority Discovery Questions

19. **"Which of these is more important?"**
    → Reveals business priority - "follow the money"
    → Orders before quotes because "we make money on orders"

20. **"What would happen if this step failed? Who would care?"**
    → Classifies errors: domain error (business cares) vs. panic (developer issue)
    → From the book: "If we get a connection abort, is that something you care about?" → "????"

### Language Discovery Questions

21. **"What do you call that?"**
    → Gets the domain expert's term, not your assumption
    → Example: Developer says "float" → Ollie says "order quantity"

22. **"Can we agree on using [term] everywhere?"**
    → Establishes Ubiquitous Language consensus
    → From the book: "We call a completed order a 'Placed order.' Can we use that everywhere?"

23. **"Is [term] the same thing in [context A] as in [context B]?"**
    → Detects polysemy - same word, different meaning in different contexts
    → Strong signal that these are separate bounded contexts

## Red Flags During Discovery

Watch for these patterns - they indicate a missing or incorrect element in the model:

| Red flag | What it means |
|----------|--------------|
| "It depends" | A choice type is hiding - drill into what it depends on |
| Developer uses technical term, expert is confused | Language mismatch - use the expert's words |
| Expert describes "piles" of things | Queues with priority - capture the pile and its priority |
| Same word used differently by different people | Separate bounded contexts with different dialects |
| "We also need to tell [other team]" | Missing downstream event consumer |
| "Sometimes we also have to..." | Edge case or alternate workflow - capture it |
| "We just put a flag on it" | Lifecycle stage disguised as a boolean - separate into types |
| "That never happens" followed by "well, except..." | Important edge case the expert initially dismissed |

## When the User IS the Domain Expert

In many Claude Code interactions, the user is both the domain expert and the developer.
In this case:

- Still follow the structured output format - it forces completeness
- Ask the user to describe the domain as if explaining it to a new team member
- Push back on technical terms: "What would a non-technical stakeholder call this?"
- Ask "what else?" after each answer - experts often omit what seems obvious to them
- Validate lifecycle stages explicitly: "Does [entity] go through distinct phases?"
