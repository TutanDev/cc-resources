# Function Adapters - Complete Catalog

Function adapters transform functions from one "shape" to another so they
can be composed in a pipeline. This is a core technique in FP-based DDD.

## Terminology

- **One-track function**: `'a -> 'b` - always succeeds
- **Switch function**: `'a -> Result<'b, 'e>` - can succeed or fail (a.k.a. "monadic")
- **Two-track function**: `Result<'a,'e> -> Result<'b,'e>` - already handles both tracks
- **Dead-end function**: `'a -> unit` - side effect, no useful return value

## Core Adapters

### `bind` - Switch → Two-Track

Converts a switch function into a two-track function.
If the input is Ok, call the switch function. If Error, bypass.

```fsharp
// Result.bind : ('a -> Result<'b,'e>) -> Result<'a,'e> -> Result<'b,'e>
let bind switchFn twoTrackInput =
    match twoTrackInput with
    | Ok success -> switchFn success
    | Error failure -> Error failure
```

**Usage:** Chain Result-generating functions in a pipeline.
```fsharp
input
|> functionA          // returns Result
|> Result.bind functionB   // functionB only runs if A succeeded
|> Result.bind functionC
```

### `map` - One-Track → Two-Track

Converts a one-track function into a two-track function.
If input is Ok, apply the function and wrap in Ok. If Error, bypass.

```fsharp
// Result.map : ('a -> 'b) -> Result<'a,'e> -> Result<'b,'e>
let map f aResult =
    match aResult with
    | Ok success -> Ok (f success)
    | Error failure -> Error failure
```

**Usage:** Slot a non-failing function into a Result pipeline.
```fsharp
input
|> validateOrder          // Result<ValidatedOrder, ...>
|> Result.bind priceOrder // Result<PricedOrder, ...>
|> Result.map createEvents // createEvents never fails → use map, not bind
```

### `mapError` - Transform the Error Track

Changes the error type without touching the success value.

```fsharp
// Result.mapError : ('e1 -> 'e2) -> Result<'a,'e1> -> Result<'a,'e2>
let mapError f aResult =
    match aResult with
    | Ok success -> Ok success
    | Error failure -> Error (f failure)
```

**Usage:** Align error types before composing steps with different error types.
```fsharp
let! validatedOrder =
    validateOrder input
    |> Result.mapError PlaceOrderError.Validation  // lift ValidationError → PlaceOrderError
```

## Structural Adapters

### `predicateToPassthru` - Predicate → One-Track Passthrough

Converts `'a -> bool` into `'a -> 'a` (returns input if true, fails if false).

```fsharp
let predicateToPassthru errorMsg f x =
    if f x then x
    else failwith errorMsg
```

**Result-returning variant:**
```fsharp
let predicateToPassthruR errorMsg f x =
    if f x then Ok x
    else Error errorMsg
```

**Usage:** Adapt a validation predicate into a pipeline step.
```fsharp
let checkProduct productCode =
    predicateToPassthruR "Invalid product" checkProductCodeExists productCode

productCode |> ProductCode.create |> Result.bind checkProduct
```

### `tee` - Dead-End → One-Track Passthrough

Calls a side-effecting function and returns the original input.

```fsharp
// tee : ('a -> unit) -> 'a -> 'a
let tee f x =
    f x
    x
```

**Two-track variant:**
```fsharp
let adaptDeadEnd f =
    Result.map (tee f)
```

**Usage:** Slot logging, metrics, or fire-and-forget calls into a pipeline.
```fsharp
validatedOrder
|> tee (fun o -> log "Validated order %s" (OrderId.value o.OrderId))
|> priceOrder getProductPrice
```

### `serviceExceptionAdapter` - Exception-Throwing → Result-Returning

Wraps a function that may throw into one that returns Result.

```fsharp
let serviceExceptionAdapter serviceInfo serviceFn x =
    try
        Ok (serviceFn x)
    with
    | :? TimeoutException as ex ->
        Error { Service = serviceInfo; Exception = ex }
    | :? AuthorizationException as ex ->
        Error { Service = serviceInfo; Exception = ex }
```

**Usage:** Adapt external services that throw into the Result pipeline.
```fsharp
let checkAddressExistsR address =
    let serviceInfo = { Name = "AddressCheck"; Endpoint = uri }
    let adapted = serviceExceptionAdapter serviceInfo checkAddressExists
    address |> adapted |> Result.mapError RemoteService
```

## Collection Adapters

### `sequence` - `Result<'a,'e> list` → `Result<'a list, 'e>`

Flips a list of results into a result of a list.

```fsharp
let sequence (results: Result<'a,'e> list) : Result<'a list, 'e> =
    let prepend firstR restR =
        match firstR, restR with
        | Ok first, Ok rest -> Ok (first :: rest)
        | Error err1, _ -> Error err1
        | _, Error err2 -> Error err2
    List.foldBack prepend results (Ok [])
```

**Usage:** After mapping a list with a Result-returning function.
```fsharp
let! lines =
    unvalidatedOrder.Lines
    |> List.map (toValidatedOrderLine checkProductCodeExists)
    |> Result.sequence
```

**Note:** Only returns the first error. For all errors, use applicatives
(not covered in basic DMF implementation).

### `traverse` - Map + Sequence in one pass

More efficient than `List.map f >> Result.sequence`:

```fsharp
let traverse f list =
    let prepend firstR restR =
        match firstR, restR with
        | Ok first, Ok rest -> Ok (first :: rest)
        | Error e, _ -> Error e
        | _, Error e -> Error e
    let folder x acc = prepend (f x) acc
    List.foldBack folder list (Ok [])
```

## Option Adapters

### `listOfOption` - `Option<'a>` → `'a list`

Convert an option to a list (Some → single-element, None → empty).
Useful when combining optional and non-optional events into a unified list.

```fsharp
let listOfOption = function
    | Some x -> [x]
    | None -> []
```

**Usage:**
```fsharp
let events1 = pricedOrder |> PlaceOrderEvent.OrderPlaced |> List.singleton
let events2 = acknowledgmentOpt |> Option.map PlaceOrderEvent.AcknowledgmentSent |> listOfOption
let events3 = pricedOrder |> createBillingEvent |> Option.map PlaceOrderEvent.BillableOrderPlaced |> listOfOption
[ yield! events1; yield! events2; yield! events3 ]
```

## Async Adapters

### `AsyncResult` helpers

```fsharp
module AsyncResult =
    let ofResult (x: Result<'a,'e>) : AsyncResult<'a,'e> =
        async { return x }

    let ofAsync (x: Async<'a>) : AsyncResult<'a,'e> =
        async { let! result = x in return Ok result }

    let bind (f: 'a -> AsyncResult<'b,'e>) (x: AsyncResult<'a,'e>) : AsyncResult<'b,'e> =
        async {
            let! result = x
            match result with
            | Ok success -> return! f success
            | Error err -> return Error err
        }

    let map f x =
        async { let! r = x in return Result.map f r }

    let mapError f x =
        async { let! r = x in return Result.mapError f r }
```

### `asyncResult` Computation Expression

```fsharp
type AsyncResultBuilder() =
    member _.Return(x) = async { return Ok x }
    member _.ReturnFrom(x) = x
    member _.Bind(x, f) = AsyncResult.bind f x
    member _.Zero() = async { return Ok () }

let asyncResult = AsyncResultBuilder()
```

**Usage:** Same as `result { }` but for async pipelines.
```fsharp
let validateOrder : ValidateOrder =
    fun checkProductCodeExists checkAddressExists unvalidatedOrder ->
        asyncResult {
            let! orderId =
                unvalidatedOrder.OrderId |> OrderId.create
                |> Result.mapError ValidationError
                |> AsyncResult.ofResult   // lift Result to AsyncResult
            let! checkedAddress =
                unvalidatedOrder.ShippingAddress
                |> toCheckedAddress checkAddressExists  // returns AsyncResult
            // ...
            return validatedOrder
        }
```
