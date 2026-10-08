# Functional C# Guidelines (G01-G12)

Function-level style rules for C#, after Enrico Buonanno's *Functional Programming in C#*.
They judge function bodies: purity, mutation, expression style, and where I/O happens.
What domain types allow (unions, constrained types, lifecycle stages) is the DMF lens, in `csharp-mapping.md`.

Mental model: treat every method as a mathematical function.
Ask whether it depends on anything besides its inputs, whether it has any effect besides its return value, and whether it can be understood without the surrounding state.

## Guardrails

Apply these before flagging anything:

- **Framework boundaries are not violations.** Mutation and I/O in the composition root, Unity lifecycle methods (`Awake`, `OnEnable`, `Update`, `OnDestroy`), event handlers, and the adapters that own I/O (repositories, gateways, platform wrappers; in a Löwy architecture: ResourceAccess) are the imperative shell.
  Flag them only when business logic hides inside them.
- **Hot paths keep imperative code.** In per-frame code (72-120 Hz loops, rendering, tracking), loops, mutable structs and pooled buffers are correct; LINQ, closures and `Result` allocations are the violation there.
  Never propose G04 or G05 for per-frame code.
- **Module contracts stay interfaces.** G08 never applies to contracts between modules, layers or assemblies (in a Löwy architecture: Manager, Engine and ResourceAccess contracts), or to interfaces that group related operations or carry domain meaning.
- **G05 is about readability.** Rewrite a loop as LINQ only when the pipeline is clearer than the loop.
- **G02 respects identity.** A type with identity semantics (an entity, a Unity object, a handle) is not a record candidate.
- **Group repeats.** One finding per pattern, with every location under `occurrences`.
- **Severity by impact.** Purity and mutation in shared or domain code usually rank above style; a style issue in a hot path can rank above a purity issue in a one-off tool.

## G01 - Prefer pure functions

Functions depend only on their arguments and have no side effects: no external mutation, no I/O, no exceptions for control flow.
Keep the computation pure and push effects to the boundary.

- **Detect:** reads of `DateTime.Now`/`UtcNow`, `Time.time`, `Random`, static mutable fields, singletons, `PlayerPrefs`, or instance fields used as hidden inputs to a computation.
- **Fix:** pass the value in, or inject a `Func<>`/delegate.

```csharp
// before
public bool IsExpired(Session s) => DateTime.UtcNow > s.ExpiresAt;
// after
public static bool IsExpired(Session s, DateTime now) => now > s.ExpiresAt;
```

## G02 - Use records for data

Data carriers are `record`s (or `readonly record struct`s for small values), immutable, with read-only collections.

- **Detect:** classes with only auto-properties, mutable DTOs inside domain code.
- **Fix:** a positional `record`, or a constrained type when it has invariants (see `csharp-mapping.md`).

## G03 - Never mutate arguments

A function does not modify what it receives; it returns new values (tuples, records, `with`).

- **Detect:** `.Add`, `.Remove`, `.Clear` or member assignment on parameters.
- **Fix:** return the extra output explicitly.

```csharp
// before
void CollectExpired(IEnumerable<Session> all, List<Session> expired) { ... expired.Add(s); }
// after
static IReadOnlyList<Session> Expired(IEnumerable<Session> all, DateTime now) =>
    all.Where(s => IsExpired(s, now)).ToArray();
```

## G04 - Avoid in-place collection mutation

Prefer `OrderBy`, `Where` and `Select` over `List.Sort`, `Array.Reverse`, `RemoveAll`, `Insert`, `RemoveAt` on collections other code can see.
Local buffers owned by one method are fine.

## G05 - LINQ pipelines over accumulator loops

Replace `foreach` loops that build a result by mutation with `Select`, `Where`, `Aggregate` or `SelectMany`, when that reads better (see Guardrails).

## G06 - Expression-bodied members

Single-expression methods, properties and local functions use `=>`.

## G07 - Switch expressions

Value-producing `switch` statements become `switch` expressions.
Over a union, the default arm throws for an unhandled case instead of returning a silent value.

## G08 - Functions over single-method interfaces

Inside a module, a one-method interface with one implementation used only for test seams becomes a delegate or `Func<>`, baked in by partial application.
See Guardrails for the interfaces that stay.

```csharp
// before
public interface IClock { DateTime UtcNow { get; } }
// after
public delegate DateTime Now();
```

## G09 - Tuples for ephemeral multi-value returns

Named tuples instead of `out` parameters or one-use classes, when no domain type is warranted.
Keep `Try*` patterns where the platform API or a hot path needs them.

## G10 - `using static` for frequent static helpers

`using static Tutan.Functional.F;` (or the project's functional library), `System.Math`, and project helper classes used throughout a file.
Follow the profile when it prefers explicit `F.` calls.

## G11 - Static local functions and lambdas

Local functions and lambdas that capture nothing are `static`, which prevents accidental closure allocations.
This matters most with state-passing overloads such as `Match(state, ..)`.

## G12 - Separate logic from I/O

Business logic does not call `File`, `HttpClient`, `PlayerPrefs`, `UnityWebRequest`, `Resources.Load`, platform SDKs or loggers in the middle of a computation.
Extract the pure core; the caller (the application service or workflow entry point, or an adapter that owns the I/O; in a Löwy architecture: a Manager or ResourceAccess) performs I/O before and after.

```csharp
// before
public void ApplyDiscount(string userId) { var tier = PlayerPrefs.GetInt(userId); _price *= Rate(tier); }
// after
public static decimal Discounted(decimal price, int tier) => price * Rate(tier);
```

## Output

Report findings in the shape of `review-findings.md`, with `lens: fp`, `rule: G##`, and a refactor proposal in `fix` that fits the surrounding code instead of copying the examples above.
