# C# Mapping for Domain Modeling Made Functional

The DMF skills explain each concept in F#, the notation of Wlaschin's book.
This file is the authoritative translation into C#.
Read it before writing or reviewing any C# domain code.

## Language Rule

- Write C# by default.
- Write F# only when the user asks for it or the project is an F# project.
- Treat every F# snippet in the DMF skills as a description of the concept, then express it with the patterns below.
- The project profile's Mapping section names the functional library and its conventions; it wins over the defaults here.
- Examples use Tutan.Functional (`com.tutan.functional`, namespace `Tutan.Functional`, factory class `F`).
  With another library (LanguageExt, CSharpFunctionalExtensions, an in-house one), keep the rules and translate the calls.

## Platform Baseline (Unity)

- Unity 6 compiles C# 9 by default.
  `record` classes need an `IsExternalInit` shim, which most functional libraries ship.
- `record struct` needs C# 10: add `-langversion:10` to a `csc.rsp` next to the asmdef that uses it.
- Nullable reference types are off unless the asmdef enables them, so `string?` documents nothing; absence is `Optional<T>`.
- `System.Collections.Immutable` is not part of the Unity profile by default; use `IReadOnlyList<T>` over a defensive copy.
- Keep domain types free of `UnityEngine` references, except where the profile allows math types such as `Vector3`.

## Tutan.Functional at a Glance

| DMF (F#) | C# with Tutan.Functional |
|---|---|
| `Result<'T,'E>` | `Result<T>`, whose failure is the fixed `Error` struct (`Message`, `Code`, `InnerErrors`); see Modeling Errors |
| `Ok x` / `Error e` | `F.Success(x)` / `F.Fail<T>(error)`; `T` and `Error` also convert implicitly to `Result<T>` |
| `Option<'T>`, `Some`, `None` | `Optional<T>`, `F.Some(x)`, `F.None` |
| `match r with Ok .. | Error ..` | `r.Match(onError: e => .., onSuccess: v => ..)`; the error branch comes first |
| `Result.map` / `Result.bind` | `.Map(f)` / `.Bind(f)` |
| `result { let! .. }` | LINQ query syntax: `from a in A from b in B(a) select ..` (via `Select`/`SelectMany`) |
| `Result.mapError` | No typed error track: add context with `F.Error("context", inner)` inside `.IfFail(..)` |
| `tee` | `.Then(action)` on a `Result`/`Optional`, or `F.Tee(action)` as a function |
| `predicateToPassthru` | `.Filter(predicate)` only when the generic "Predicate not satisfied" error is acceptable; otherwise `.Bind` with a domain error |
| exception adapter | `F.Try(() => ..)`, `F.TryAsync(() => ..)` |
| `Option.defaultValue` | `.Or(fallback)`, `.OrElse(() => ..)` |
| `Option.toResult` | `.ToResult(() => F.Error(".."))` |
| `Async<Result<'T,'E>>` | `UniTask<Result<T>>` with `MapAsync`, `BindAsync`, `ThenAsync`, `MatchAsync` |
| applicative validation | `F.HarvestErrors(validators)` for one value; `.Map(curriedFn).Apply(r2).Apply(r3)` to build from several |
| fail-fast validation | `F.FailFast(validators)` |
| `x |> f` | `x.Pipe(f)` |
| `unit` | `Unit`, `F.Unit()`; `Result<Unit>` for commands with no value |
| `Result.sequence` / `traverse` over lists | Not built in: write the fold once per project (see Collections of Results) |

`F.Success(null)` and a destroyed `UnityEngine.Object` become an error, never a successful null.
`default(Result<T>)` is a failure with an empty message: never return `default` from a function that returns `Result<T>`.

## Simple Constrained Types

Wrap every domain primitive.
The constructor is private and `Create` is the only way in.

```csharp
public readonly struct OrderQuantity : IEquatable<OrderQuantity>
{
    public const int Max = 1000;
    private readonly int _value;
    private OrderQuantity(int value) => _value = value;
    public int Value => _value;

    public static Result<OrderQuantity> Create(int raw) =>
        raw is >= 1 and <= Max
            ? F.Success(new OrderQuantity(raw))
            : F.Fail<OrderQuantity>($"An order quantity is between 1 and {Max}.");

    public bool Equals(OrderQuantity other) => _value == other._value;
    public override bool Equals(object obj) => obj is OrderQuantity other && Equals(other);
    public override int GetHashCode() => _value;
    public override string ToString() => _value.ToString();
}
```

Choose the shape by the invariant:

| Shape | Use when | Watch out for |
|---|---|---|
| `readonly struct` with private ctor | Small values, hot paths, no allocation wanted | `default(T)` bypasses `Create`; make the default harmless (`_value ?? string.Empty`) or document it as "absent" |
| `sealed record` with private ctor and get-only properties | The default value would be illegal and the type is not per-frame | Allocation per value |
| `sealed record` positional (`record Name(string Value)`) | Never for constrained types | The public constructor and `with` bypass `Create` |

Rules:

- Properties are get-only (`{ get; }`), never `init`: `with` can rewrite `init` properties and skip validation.
- `Create` returns `Result<T>`, or `Optional<T>` when "not valid" carries no information.
- Normalize before validating when the domain says so (trim, keep digits), and say why in the doc comment.
- Equality is ordinal and value-based; implement `IEquatable<T>` on structs.

## AND Types (Records)

A record whose fields are all constrained types is valid by construction, so a positional record is fine:

```csharp
public sealed record CustomerInfo(PersonalName Name, EmailAddress Email);
```

- Collections in domain records are `IReadOnlyList<T>` built from a copy (`items.ToArray()`), never a caller's `List<T>`.
- Record equality compares collections by reference; override `Equals` or compare with `SequenceEqual` when value equality over the items matters.

## OR Types (Unions)

C# has no native union.
Encode one as a closed record hierarchy: the base has a private constructor and the cases are nested sealed records.

```csharp
public abstract record PaymentMethod
{
    private PaymentMethod() { }

    public sealed record Cash : PaymentMethod
    {
        public static readonly Cash Instance = new();
    }
    public sealed record Card(CardType Type, CardNumber Number) : PaymentMethod;
    public sealed record Voucher(VoucherCode Code) : PaymentMethod;
}
```

- The private constructor closes the set: no code outside the base can add a case.
- A case without data is a singleton (`Instance`).
- The base holds no data and no behavior, so this is a union, not the "inheritance hierarchy" DMF warns against.
  Open hierarchies (public or protected base constructors, virtual behavior, cases in other files or assemblies) stay forbidden.
- Use an `enum` only when no case carries data and the set is stable; casts such as `(Color)42` make enums open.

Consume a union with a switch expression whose default arm reports a programming error:

```csharp
decimal Fee(PaymentMethod method) => method switch
{
    PaymentMethod.Cash => 0m,
    PaymentMethod.Card card => CardFee(card.Type),
    PaymentMethod.Voucher => 0m,
    _ => throw new InvalidOperationException($"Unhandled {method.GetType().Name}"),
};
```

The compiler does not check exhaustiveness over record cases.
When a union has many consumers or crosses a service boundary, give the base an abstract `Match` with one parameter per case, so that adding a case breaks every caller at compile time:

```csharp
public abstract R Match<R>(Func<Cash, R> cash, Func<Card, R> card, Func<Voucher, R> voucher);
// each case: public override R Match<R>(..) => card(this);
```

In per-frame code, prefer an enum tag plus a struct payload over allocating record cases.

## Entities, Value Objects, Aggregates

- Value objects are records or `readonly struct`s with value equality.
- Entities are compared by identity: a sealed record that overrides `Equals(T other)` and `GetHashCode()` to use only the `Id`, or a sealed class with the same members.
- Changes to an entity return a new instance (`with` on non-constrained fields, or a method that validates and returns `Result<T>`).
- An aggregate is changed only through its root; child collections are `IReadOnlyList<T>`.
- References to other aggregates are by ID type (`CustomerId`), never by object.

## Lifecycle Stages

One type per stage, never a status flag:

```csharp
public sealed record UnvalidatedOrder(string OrderId, string CustomerEmail, IReadOnlyList<UnvalidatedLine> Lines);
public sealed record ValidatedOrder(OrderId Id, EmailAddress CustomerEmail, IReadOnlyList<ValidatedLine> Lines);
public sealed record PricedOrder(OrderId Id, EmailAddress CustomerEmail, IReadOnlyList<PricedLine> Lines, Price Total);
```

When an object moves through states at runtime (a UI surface, a session), the state itself is a union and the owner holds one field of the union type.
Never hold a pair such as `bool isLoaded` and `Data data` whose combinations include nonsense.

## Workflows and Dependencies

A workflow is a function from input to output.
Name its type with a delegate so the signature is the documentation:

```csharp
public delegate Result<PricedOrder> PriceOrder(ValidatedOrder order);
public delegate Optional<Price> GetProductPrice(ProductCode code);
public delegate UniTask<Result<Unit>> SendAcknowledgment(OrderAcknowledgment ack);
```

Dependencies are parameters, baked in by partial application:

```csharp
public static class Pricing
{
    public static PriceOrder Create(GetProductPrice getPrice) =>
        order => PriceLines(order, getPrice);

    private static Result<PricedOrder> PriceLines(ValidatedOrder order, GetProductPrice getPrice) => ..;
}
```

- The composition root (named by the project profile) builds the delegates once and hands them to the application service or workflow entry point (a Löwy Manager).
- Inside a module, inject delegates or `Func<>` by partial application.
- Contracts between modules, layers or assemblies stay interfaces (in a Löwy architecture: Manager, Engine and ResourceAccess contracts).
- A static class of pure functions is the implementation; a class with mutable fields is not a workflow.
- `F.CurryFirst` and `.Curry()` help when a dependency is the first of many parameters.

## Composing Steps

Explicit step variables read best for short workflows:

```csharp
public static PlaceOrder Create(CheckProductExists checkProduct, GetProductPrice getPrice) =>
    unvalidated =>
        from validated in Validation.Validate(unvalidated, checkProduct)
        from priced in Pricing.Price(validated, getPrice)
        select Events.Create(priced);
```

- Query syntax is the C# counterpart of the `result { }` computation expression.
- Fluent chains (`.Bind(..).Map(..)`) are equivalent; follow the profile's preference.
- Steps that cannot fail are plain functions joined with `.Map`.
- Wrap exception-throwing calls at the edge with `F.Try` / `F.TryAsync`; exceptions never cross into domain code.

### Collections of Results

Write the fold once per project and reuse it:

```csharp
public static Result<IReadOnlyList<T>> Sequence<T>(this IEnumerable<Result<T>> results)
{
    var values = new List<T>();
    foreach (var r in results)
    {
        if (!r.IsSuccess(out var v)) return r.ErrorUnsafe();
        values.Add(v);
    }
    return F.Success<IReadOnlyList<T>>(values);
}
```

C# ignores user-defined conversions from interface types, so `return values;` does not compile here: wrap with `F.Success<IReadOnlyList<T>>`.

Use `F.HarvestErrors` instead when the user must see every failure at once (form validation).

## Modeling Errors

DMF errors are a domain concept: model them as a closed union named in the ubiquitous language.

```csharp
public abstract record PlaceOrderError
{
    private PlaceOrderError() { }
    public sealed record ValidationFailed(string Field, string Reason) : PlaceOrderError;
    public sealed record ProductNotFound(ProductCode Code) : PlaceOrderError;
    public sealed record RemoteServiceFailed(string Service) : PlaceOrderError;
}
```

Tutan.Functional's `Result<T>` has no typed error parameter yet.
Until it does:

- Create every failure from a case of the workflow's error union, never from an ad-hoc string.
- Give each case a stable `Code` and adapt it with one `ToError()` on the union: `F.Error(message, code)`, wrapping an inner `Error` when there is one.
- Consumers branch on `error.Code` against the union's constants, never on message text.
- The typed payload does not survive the adaptation; keep what the edge needs in the message or the code.
- Do not invent a `Result<T, E>`: check the library version first, and switch to it when it exists.

Classify before modeling: domain errors (expected, part of the language) go in the union; infrastructure faults (network, disk) become one `RemoteServiceFailed`-style case; programming errors (broken invariants, unhandled union cases) throw.

## Async

- Async effects are `UniTask<Result<T>>`, composed with `MapAsync`, `BindAsync`, `ThenAsync` and `MatchAsync`.
- Await at the edge: the application service or workflow entry point and the adapters that own I/O (in a Löwy architecture: Managers and ResourceAccess); domain functions stay synchronous and pure.
- Pass `CancellationToken` explicitly; cancellation is not a domain error.

## Hot Paths

Per-frame code (tracking, rendering, input at 72-120 Hz) keeps the rules that cost nothing and drops the ones that allocate:

- Keep: constrained `readonly struct` types, lifecycle stage types created once, purity of the per-frame function.
- Drop: `Result`, `Optional` over reference types, LINQ, closures and record allocations inside the loop.
- Validate once at the boundary (on load, on configuration change) and keep the validated value.
- Tutan.Functional's state-passing overloads (`Match(state, ..)`, `Then(state, ..)`, `Map(state, ..)`) avoid closure allocations when the lambdas are `static`.
- A rule dropped for performance needs a measurement and, at the architecture level, an Approved deviations entry in the project profile.

## Serialization and DTOs in Unity

Domain types are never serialized directly.
Each boundary gets a DTO with primitive fields, `FromDomain` (total) and `ToDomain` (returns `Result<T>`).

| Serializer | Can serialize | Cannot serialize | DTO shape |
|---|---|---|---|
| `JsonUtility` / Inspector | Public or `[SerializeField]` fields of `[Serializable]` classes and structs | Properties, dictionaries, polymorphism, get-only records, `Optional<T>` | Mutable `[Serializable]` class with public fields; arrays not lists of records |
| Newtonsoft Json.NET | Properties, constructors, dictionaries | Private-constructor domain types without converters | Plain class or record with public properties |
| `[SerializeReference]` | Polymorphic managed references (classes only) in components and ScriptableObjects | Structs, generic open types; renamed types lose data | Small `[Serializable]` class hierarchy, mapped to the domain union on load |

- Unions serialize as a tagged DTO: a `string Kind` (or `int`) field plus one optional field per case; `ToDomain` switches on the tag and fails on an unknown tag.
- Avoid `TypeNameHandling` in Newtonsoft: it couples data to type names and is a security risk; use an explicit tag.
- Optional values: `SerializableOptional<T>` for Inspector fields; a nullable field in JSON DTOs, mapped to `Optional<T>` in `ToDomain`.
- ScriptableObject configs are DTOs: the edge code that loads them (in a Löwy architecture: a Manager or ResourceAccess) validates them once (`ToDomain`) and the domain sees only the result.
- For `[SerializeReference]` types, add `[UnityEngine.Scripting.APIUpdating.MovedFrom]` when renaming or moving a type, or existing assets lose their data.

### Versioning Persisted Data

Players keep old saves (PlayerPrefs JSON, files), so every persisted DTO carries a schema version:

- Add an `int Version` field from the first release.
- Keep one DTO type per version that ever shipped, and one pure migration per step (`V1 -> V2`, `V2 -> V3`), composed in order on load.
- Migrate DTOs, never domain types; `ToDomain` runs once, on the latest DTO.
- A save that fails `ToDomain` is a domain outcome (reset, or ask the user), not an exception.
- Keep a sample JSON of each shipped version as a test fixture, and test that it migrates and maps to the domain.

## Testing

- Pure domain functions get EditMode tests with no scene, no MonoBehaviour, and no Play Mode.
- Test each `Create` at its boundaries (min, max, just outside, empty, default struct).
- Test each workflow with stub delegates; no mocking framework is needed when dependencies are delegates.
- Test `ToDomain(FromDomain(x)) == Success(x)` for every DTO.

## Review Checklist (C#)

| Smell | DMF rule | Fix |
|---|---|---|
| `string`/`int`/`Guid` parameters for domain concepts | No primitives in the domain | Constrained type with `Create` |
| Positional record or public constructor on a constrained type | Constraints live in smart constructors | Private constructor, get-only properties, `Create` |
| `init` properties on a validated type | Same | Get-only properties, a validating method that returns `Result<T>` |
| `bool` flags, or nullable fields valid only in some states | Make illegal states unrepresentable | A union of the valid states |
| Status enum plus fields that depend on it | Separate types per lifecycle stage | One type per stage |
| Open hierarchy (protected/public base constructor, virtual behavior) for domain variants | No class-driven design | Closed union |
| `switch` on a union with a silent default | Totality | Throwing default arm or an abstract `Match` |
| `throw` or `try/catch` for expected domain failures | Effects are explicit in signatures | `Result<T>` with a domain error case |
| `null` returned for "not found" | Same | `Optional<T>` |
| Ad-hoc error strings, branching on message text | Errors are domain concepts | Error union with stable codes |
| I/O (`PlayerPrefs`, HTTP, `File`, `UnityEngine.XR`) inside domain functions | I/O at the edges | Move to an adapter that owns the I/O (in a Löwy architecture: ResourceAccess); pass data in |
| Domain type with `[Serializable]`, `[SerializeField]` or JSON attributes | Persistence ignorance | DTO plus `ToDomain`/`FromDomain` |
| The same domain type used by two bounded contexts | Contexts talk through DTOs and events | DTO at the boundary |
| `List<T>` field in a domain record | Immutability | `IReadOnlyList<T>` over a copy |
| Unversioned persisted DTO | Versioning | `Version` field and migrations |

Severity guide for reviews: 🔴 an illegal state is reachable or data can be lost; 🟠 a domain concept is untyped or a rule is broken in a way that will spread; 🟡 the design works but hides intent; ⚪ naming and polish.
