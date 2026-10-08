# Error Handling - Railroad-Oriented Programming

## Error Classification

Before implementing error handling, classify each error:

| Category | Handling | Example |
|----------|----------|---------|
| **Domain Error** | Model as Result, handle explicitly | Invalid product code, out of stock |
| **Panic** | Throw exception, catch at top level | Out of memory, null reference, divide by zero |
| **Infrastructure Error** | Model as Result if business cares, else throw | Timeout, auth failure |

**Rule of thumb:** If a domain expert would care about the error, model it. If not, throw.

## The Two-Track Model

Every function in the pipeline operates on two tracks:
- **Success track** - data flows forward through the pipeline
- **Failure track** - errors bypass remaining steps

```
  validateOrder ──→ priceOrder ──→ acknowledgeOrder ──→ createEvents
       │                │               │                    │
       └── Error ───────┴── Error ──────┴──── Error ─────────┘
```

## Composing Steps with Different Error Types

### Problem
```fsharp
validateOrder : UnvalidatedOrder -> Result<ValidatedOrder, ValidationError>
priceOrder    : ValidatedOrder   -> Result<PricedOrder, PricingError>
// Can't compose: ValidationError ≠ PricingError
```

### Solution: Common error type + mapError

```fsharp
type PlaceOrderError =
    | Validation of ValidationError
    | Pricing of PricingError
    | RemoteService of RemoteServiceError

// Lift each step's error type into the common type
let placeOrder unvalidatedOrder =
    result {
        let! validatedOrder =
            validateOrder unvalidatedOrder
            |> Result.mapError PlaceOrderError.Validation

        let! pricedOrder =
            priceOrder validatedOrder
            |> Result.mapError PlaceOrderError.Pricing

        return pricedOrder
    }
```

## Building the Pipeline: Step by Step

### Without effects (first pass)

```fsharp
let placeOrder unvalidatedOrder =
    unvalidatedOrder
    |> validateOrder
    |> priceOrder
    |> acknowledgeOrder
    |> createEvents
```

### With Result (second pass)

```fsharp
let placeOrder unvalidatedOrder =
    unvalidatedOrder
    |> validateOrderAdapted        // first in pipeline: no bind needed
    |> Result.bind priceOrderAdapted
    |> Result.map acknowledgeOrder  // never fails: use map
    |> Result.map createEvents
```

### With computation expression (final)

```fsharp
let placeOrder unvalidatedOrder =
    result {
        let! validatedOrder =
            validateOrder unvalidatedOrder
            |> Result.mapError Validation
        let! pricedOrder =
            priceOrder validatedOrder
            |> Result.mapError Pricing
        let acknowledgmentOption =
            acknowledgeOrder pricedOrder   // no let! - always succeeds
        let events =
            createEvents pricedOrder acknowledgmentOption
        return events
    }
```

## When Functions Don't Compose Cleanly

Sometimes the output of step N doesn't match the input of step N+1 even with
bind/map. In that case, use an imperative style with named intermediate values:

```fsharp
let placeOrder unvalidatedOrder =
    result {
        let! validatedOrder =
            validateOrder checkProductExists checkAddressExists unvalidatedOrder
            |> Result.mapError Validation
        let! pricedOrder =
            priceOrder getProductPrice validatedOrder
            |> Result.mapError Pricing
        // acknowledgeOrder returns the event, not the pricedOrder
        // so we can't just pipe it → use named values
        let acknowledgmentOption =
            acknowledgeOrder createLetter sendAcknowledgment pricedOrder
        // createEvents needs BOTH pricedOrder and acknowledgmentOption
        let events =
            createEvents pricedOrder acknowledgmentOption
        return events
    }
```

This is perfectly fine. Not everything needs to be point-free.

## Converting Exception-Throwing Code to Result

```fsharp
// Wrap an external service
let checkAddressExistsR address =
    let serviceInfo = { Name = "AddressCheckingService"; Endpoint = uri }
    address
    |> serviceExceptionAdapter serviceInfo checkAddressExists
    |> Result.mapError RemoteService  // lift to workflow error type
```

## Handling Optional Results (Events)

When creating events, some are always emitted, some are conditional:

```fsharp
let createEvents pricedOrder acknowledgmentEventOpt =
    // Always emitted
    let events1 =
        pricedOrder
        |> PlaceOrderEvent.OrderPlaced
        |> List.singleton

    // Conditional: only if acknowledgment was sent
    let events2 =
        acknowledgmentEventOpt
        |> Option.map PlaceOrderEvent.AcknowledgmentSent
        |> listOfOption

    // Conditional: only if billing amount > 0
    let events3 =
        pricedOrder
        |> createBillingEvent
        |> Option.map PlaceOrderEvent.BillableOrderPlaced
        |> listOfOption

    [ yield! events1; yield! events2; yield! events3 ]
```

Pattern: lift to common type → convert option to list → concatenate.

## Dealing with `Result list` vs `list Result`

After `List.map` with a fallible function, you get `Result<'a,'e> list`.
You need `Result<'a list, 'e>`. Use `Result.sequence`:

```fsharp
let! validatedLines =
    unvalidatedOrder.Lines
    |> List.map (toValidatedOrderLine checkProductCodeExists)
    |> Result.sequence
```

**Caveat:** `sequence` returns only the first error. For collecting all errors
(e.g., validation), you need applicative validation (see below).

## Applicative Validation (Collecting All Errors)

For validation, you often want ALL errors, not just the first.
This requires an applicative approach rather than monadic bind.

Basic idea: instead of short-circuiting on first error, accumulate errors:

```fsharp
module Validation =
    type Validation<'Success, 'Failure> =
        Result<'Success, 'Failure list>

    let apply fResult xResult =
        match fResult, xResult with
        | Ok f, Ok x -> Ok (f x)
        | Error e1, Ok _ -> Error e1
        | Ok _, Error e2 -> Error e2
        | Error e1, Error e2 -> Error (e1 @ e2)
```

This is an advanced topic. The basic `result { }` approach (returning first error)
is sufficient for most implementations.

## Complete Result Module

```fsharp
module Result =
    let bind f = function
        | Ok s -> f s
        | Error e -> Error e

    let map f = function
        | Ok s -> Ok (f s)
        | Error e -> Error e

    let mapError f = function
        | Ok s -> Ok s
        | Error e -> Error (f e)

    let ofOption errorValue = function
        | Some v -> Ok v
        | None -> Error errorValue

    let bindOption f = function
        | Some x -> f x |> map Some
        | None -> Ok None

    let sequence results =
        let prepend first rest =
            match first, rest with
            | Ok f, Ok r -> Ok (f :: r)
            | Error e, _ | _, Error e -> Error e
        List.foldBack prepend results (Ok [])

type ResultBuilder() =
    member _.Return(x) = Ok x
    member _.ReturnFrom(x) = x
    member _.Bind(x, f) = Result.bind f x
    member _.Zero() = Ok ()

let result = ResultBuilder()
```
