# Review Findings Contract

Every reviewer in the `dmf` and `lowy` plugins reports findings in this shape: the `dmf:dmf-reviewer` and `dmf:fp-reviewer` agents, the `lowy:lowy-reviewer` and `lowy:call-chain-validator` agents, the `lowy:arch-reviewer` skill, and the `/lowy:arch-audit` and `/lowy:design-check` workflows.
One shape lets the workflows verify, deduplicate and rank findings from different lenses and both plugins.
Both plugins keep an identical copy of this contract.

## Evidence

- A finding about code cites `file:line` and quotes the lines, read from the file in this session.
- A finding about a design cites the design file and section (`03-layered-architecture.md §4`).
- Documentation, comments and commit messages are claims to verify, not evidence.
- If a rule cannot be checked statically (runtime wiring, reflection, scene references), list it under "Not checked" instead of guessing.

## Status

Apply the precedence in `project-profile.md` to every finding:

| Status | Mark | Meaning |
|---|---|---|
| `violation` | ❌ | Breaks a rule and matches no profile entry; consistent use elsewhere does not excuse it |
| `debt` | ⚠️ | Matches a **Known debt** entry; cite the entry |
| `approved` | ✅ | Matches an **Approved deviations** entry; cite the entry |

Without a project profile, every finding is a `violation`, and the report says once that no profile was found.

## Severity

| Severity | Mark | Meaning |
|---|---|---|
| `critical` | 🔴 | Breaks the architecture or correctness: a Design Don't or a closed-architecture breach in a core use case, an illegal state that is reachable, data that can be lost or corrupted |
| `major` | 🟠 | A rule broken in a way that will spread: misclassified layer, untyped domain concept, mutation of shared state, missing error case |
| `minor` | 🟡 | Works, but hides intent or costs testability: naming, asymmetry, impure helper outside a hot path |
| `nit` | ⚪ | Polish |

Judge severity by impact in context: the same rule can be critical in a core use case and minor in a one-off tool.

## Fields

| Field | Content |
|---|---|
| `id` | Lens prefix and number: `L-01` (Löwy structure), `C-01` (call chains), `D-01` (DMF), `F-01` (functional style), `X-01` (design-check simulation) |
| `lens` | `lowy`, `chains`, `dmf`, `fp`, or `change` |
| `rule` | The rule broken, with its number where one exists: `Design Don't #2`, `Invariant 10`, `DMF: illegal states unrepresentable`, `G03` |
| `status` | `violation`, `debt`, or `approved` |
| `severity` | `critical`, `major`, `minor`, or `nit` |
| `file` | Repository-relative path, or the design file |
| `lines` | `120` or `120-134`; empty for a design section |
| `evidence` | The quoted code or design text, at most 8 lines |
| `problem` | One or two sentences: what is wrong and why it matters |
| `fix` | A concrete change: the target type, layer, signature or code shape |
| `profileRef` | The profile entry for `debt` or `approved`; empty otherwise |
| `occurrences` | Other `file:line` locations of the same issue, so a repeated pattern is one finding |

## Markdown Form

When the caller does not ask for structured output, write each finding as:

```
### ❌ 🔴 L-01 Design Don't #2: Client calls an Engine
`Assets/Foo/FooView.cs:42`
> var score = _scoringEngine.Score(input);

**Problem:** ...
**Fix:** ...
**Also at:** `Assets/Foo/BarView.cs:17`
```

End every review with:

1. **Aligned** - what already follows the method (short; it shows the reviewer read the code).
2. **Profile gaps** - conventions the code follows that the profile does not state, and violations that look deliberate.
   Propose them as Known debt or Approved deviations entries for the user to decide; never present them as approved.
3. **Not checked** - rules that could not be verified statically, and why.
