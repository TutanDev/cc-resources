# Review Findings Contract

Every reviewer in the `dmf`, `lowy` and `devflow` plugins reports findings in this shape: the `dmf:dmf-reviewer` and `dmf:fp-reviewer` agents, the `lowy:lowy-reviewer` and `lowy:call-chain-validator` agents, the `devflow:plan-reviewer` agent, the `lowy:arch-reviewer` skill, and the `/lowy:arch-audit`, `/lowy:design-check` and `/devflow:review-plan` workflows.
One shape lets the workflows verify, deduplicate and rank findings from different lenses and plugins.
The three plugins keep identical copies of this contract.

## Evidence

- A finding about code cites `file:line` and quotes the lines, read from the file in this session.
- A finding about a design or a feature plan cites the file and section (`04-domain-model.md §2`, `03-layered-architecture.md §4`, `cc-docs/plans/discount-codes.md §4.1`).
- Documentation, comments and commit messages are claims to verify, not evidence.
- A rule you could not check at all goes under "Not checked".
  A problem you suspect but reading cannot settle (runtime wiring, reflection, scene references, threading) is a runtime finding, reported unproven, as Proof says.

## Proof

Each finding says what kind of claim it makes and how far its proof got, because reading proves what the text says, not what the code does when it runs.

- A **structural** claim is settled by the text: a type, a signature, a dependency or a call as written, a layer, a name, a missing union case, a mutable field, a plan section that is missing or contradicts another.
- A **runtime** claim is about what happens when the code runs, which the text alone does not settle: the order or timing of calls, the thread a call runs on, the value that arrives, what a library, serializer, engine or platform does, how fast something is, or whether a path is reached through reflection, wiring, scene references or events.
  When in doubt, the claim is runtime.

The proof levels, weakest first:

| Proof | Meaning |
|---|---|
| `said` | Stated, with nothing cited; never enough |
| `cited` | The `file:line` or section, read in this session and quoted in `evidence` |
| `traced` | The path walked step by step, each step cited, showing the bad case is reached |
| `ran` | A script, test or command against the real code showed it; `run` gives the command and its output |
| `reproduced` | Reproduced in the running app; `run` gives the steps and what was observed |

A structural claim is proven at `cited`.
A runtime claim is proven only at `ran` or `reproduced`; below that it is **unproven**, and `run` names the smallest command or app steps that would prove or refute it, so whoever can run it settles it.
A reviewer that cannot run anything still reports a runtime problem it suspects, unproven, rather than leaving it out or passing it off as structural.
A skeptic checks the proof as well as the evidence: a runtime finding below `ran` is unproven, not confirmed, and a `ran` without the command and its output counts as `said`.

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
| `id` | Lens prefix and number: `L-01` (Löwy structure), `C-01` (call chains), `D-01` (DMF), `F-01` (functional style), `X-01` (design-check simulation), `P-01` (plan delivery) |
| `lens` | `lowy`, `chains`, `dmf`, `fp`, `change`, or `plan` |
| `rule` | The rule broken, with its number where one exists: `Design Don't #2`, `Invariant 10`, `DMF: illegal states unrepresentable`, `G03` |
| `status` | `violation`, `debt`, or `approved` |
| `severity` | `critical`, `major`, `minor`, or `nit` |
| `file` | Repository-relative path, or the design or plan file with its section |
| `lines` | `120` or `120-134`; empty for a design or plan section |
| `evidence` | The quoted code, design or plan text, at most 8 lines |
| `problem` | One or two sentences: what is wrong and why it matters |
| `fix` | A concrete change: the target type, layer, signature or code shape |
| `claim` | `structural` or `runtime`, as Proof defines them |
| `proof` | `said`, `cited`, `traced`, `ran`, or `reproduced` |
| `run` | For a runtime claim, the command or app steps that prove or refute it, then the output when it ran; empty for a structural claim |
| `profileRef` | The profile entry for `debt` or `approved`; empty otherwise |
| `occurrences` | Other `file:line` locations of the same issue, so a repeated pattern is one finding |

## Markdown Form

When the caller does not ask for structured output, write each finding as:

```
### ❌ 🔴 L-01 Design Don't #2: Client calls an Engine
`Assets/Foo/FooView.cs:42`
> var score = _scoringEngine.Score(input);

**Problem:** ...
**Proof:** structural, cited.
**Fix:** ...
**Also at:** `Assets/Foo/BarView.cs:17`
```

A runtime finding's Proof line also gives its run, and says unproven below `ran`: `**Proof:** runtime, traced, unproven: run <command or steps> and look for <the output that would show it>.`

End every review with:

1. **Aligned** - what already follows the method (short; it shows the reviewer read the code).
2. **Profile gaps** - conventions the code follows that the profile does not state, and violations that look deliberate.
   Propose them as Known debt or Approved deviations entries for the user to decide; never present them as approved.
3. **Not checked** - rules that could not be verified statically, and why.
