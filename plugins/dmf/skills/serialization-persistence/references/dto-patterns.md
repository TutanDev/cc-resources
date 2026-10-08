# DTO Patterns - Complete Translation Guide

## Single-Case Unions → Primitive

```fsharp
// Domain
type ProductCode = ProductCode of string

// DTO: just use string
// fromDomain
let productCodeToDto (ProductCode code) = code
// toDomain
let productCodeFromDto str = ProductCode.create str
```

## Options → Nullable / null

For reference types (string, record), `None` → `null`:
```fsharp
// Domain
type Order = { Description : String50 option }

// DTO
type OrderDto = { Description : string }  // null = None

// fromDomain
let descriptionToDto = Option.map String50.value |> Option.defaultValue null
// toDomain
let descriptionFromDto str =
    if isNull str then Ok None
    else str |> String50.create "Description" |> Result.map Some
```

For value types (int, decimal, DateTime), use `Nullable<T>`:
```fsharp
// Domain
type Order = { Quantity : UnitQuantity option }

// DTO
type OrderDto = { Quantity : Nullable<int> }

// fromDomain
let quantityToDto = Option.map UnitQuantity.value
                    |> Option.map Nullable
                    |> Option.defaultValue (Nullable())
// toDomain
let quantityFromDto (n: Nullable<int>) =
    if n.HasValue then n.Value |> UnitQuantity.create |> Result.map Some
    else Ok None
```

## Records → Records with primitive fields

```fsharp
// Domain
type OrderLine = {
    OrderLineId : OrderLineId
    ProductCode : ProductCode
    Quantity : OrderQuantity option
    Description : string option
}

// DTO
type OrderLineDto = {
    OrderLineId : int
    ProductCode : string
    Quantity : Nullable<int>
    Description : string         // null = None
}

// fromDomain
let fromDomain (line: OrderLine) : OrderLineDto =
    {
        OrderLineId = line.OrderLineId |> OrderLineId.value
        ProductCode = line.ProductCode |> ProductCode.value
        Quantity = line.Quantity |> Option.map OrderQuantity.value
                   |> Option.map (fun d -> Nullable(int d))
                   |> Option.defaultValue (Nullable())
        Description = line.Description |> Option.defaultValue null
    }

// toDomain
let toDomain (dto: OrderLineDto) : Result<OrderLine, string> =
    result {
        let! orderLineId = dto.OrderLineId |> OrderLineId.create
        let! productCode = dto.ProductCode |> ProductCode.create
        let! quantity =
            if dto.Quantity.HasValue
            then dto.Quantity.Value |> OrderQuantity.create |> Result.map Some
            else Ok None
        return {
            OrderLineId = orderLineId
            ProductCode = productCode
            Quantity = quantity
            Description = if isNull dto.Description then None else Some dto.Description
        }
    }
```

## Collections → Arrays

```fsharp
// Domain
type Order = { Lines : OrderLine list }

// DTO
type OrderDto = { Lines : OrderLineDto[] }

// fromDomain
let linesToDto lines = lines |> List.map OrderLineDto.fromDomain |> List.toArray

// toDomain
let linesFromDto (dtos: OrderLineDto[]) =
    dtos |> Array.toList |> List.map OrderLineDto.toDomain |> Result.sequence
```

## Maps → Array of key-value records

```fsharp
// Domain
type PriceLookup = Map<ProductCode, Price>

// DTO option 1: array of pairs
type PriceLookupPairDto = { Key : string; Value : decimal }
type PriceLookupDto = { KVPairs : PriceLookupPairDto[] }

// DTO option 2: parallel arrays
type PriceLookupDto = { Keys : string[]; Values : decimal[] }
```

## Enum-like DUs → .NET enums or strings

```fsharp
// Domain
type Color = Red | Green | Blue

// DTO option 1: .NET enum
type ColorDto = Red = 1 | Green = 2 | Blue = 3

let colorFromDomain = function
    | Red -> ColorDto.Red
    | Green -> ColorDto.Green
    | Blue -> ColorDto.Blue

let colorToDomain = function
    | ColorDto.Red -> Ok Red
    | ColorDto.Green -> Ok Green
    | ColorDto.Blue -> Ok Blue
    | x -> Error (sprintf "Unknown color: %O" x)

// DTO option 2: string
let colorFromDomain = function
    | Red -> "Red" | Green -> "Green" | Blue -> "Blue"

let colorToDomain = function
    | "Red" -> Ok Red | "Green" -> Ok Green | "Blue" -> Ok Blue
    | x -> Error (sprintf "Unknown color: '%s'" x)
```

## Choice Types with Data → Tagged record

```fsharp
// Domain
type Name = { First : String50; Last : String50 }
type Example =
    | A
    | B of int
    | C of string list
    | D of Name

// DTO
type NameDto = { First : string; Last : string }
type ExampleDto = {
    Tag : string               // "A", "B", "C", "D"
    BData : Nullable<int>      // data for B case
    CData : string[]           // data for C case
    DData : NameDto            // data for D case (null if not D)
}
```

### fromDomain (always succeeds)

```fsharp
let fromDomain (domainObj: Example) : ExampleDto =
    let nullBData = Nullable()
    let nullCData = null
    let nullDData = Unchecked.defaultof<NameDto>
    match domainObj with
    | A ->
        { Tag = "A"; BData = nullBData; CData = nullCData; DData = nullDData }
    | B i ->
        { Tag = "B"; BData = Nullable i; CData = nullCData; DData = nullDData }
    | C strList ->
        { Tag = "C"; BData = nullBData; CData = strList |> List.toArray; DData = nullDData }
    | D name ->
        { Tag = "D"; BData = nullBData; CData = nullCData; DData = nameDtoFromDomain name }
```

### toDomain (returns Result, checks for null)

```fsharp
let toDomain (dto: ExampleDto) : Result<Example, string> =
    match dto.Tag with
    | "A" -> Ok A
    | "B" ->
        if dto.BData.HasValue then dto.BData.Value |> B |> Ok
        else Error "B data not expected to be null"
    | "C" ->
        match dto.CData with
        | null -> Error "C data not expected to be null"
        | arr -> arr |> Array.toList |> C |> Ok
    | "D" ->
        match box dto.DData with
        | null -> Error "D data not expected to be null"
        | _ -> dto.DData |> nameDtoToDomain |> Result.map D
    | tag -> Error (sprintf "Tag '%s' not recognized" tag)
```

## Generic Result DTO

```fsharp
type ResultDto<'OkData, 'ErrorData
    when 'OkData : null and 'ErrorData : null> = {
    IsError : bool
    OkData : 'OkData
    ErrorData : 'ErrorData
}

// Or concrete (when serializer doesn't support generics):
type PlaceOrderResultDto = {
    IsError : bool
    OkData : PlaceOrderEventDto[]
    ErrorData : PlaceOrderErrorDto
}
```

## Tuples → Records

Tuples are not supported in most serialization formats.

```fsharp
// Domain
type Card = Suit * Rank

// DTO
type CardDto = { Suit : SuitDto; Rank : RankDto }
```

## Alternative: Map-Based Serialization

Instead of typed DTOs, serialize everything as `IDictionary<string, obj>`.

**Advantage:** No contract in DTO structure → highly decoupled.
**Disadvantage:** No compile-time safety on the contract.

```fsharp
// Serializing a record as a map
let nameDtoFromDomain (name: Name) : IDictionary<string, obj> =
    [
        ("First", name.First |> String50.value :> obj)
        ("Last", name.Last |> String50.value :> obj)
    ] |> dict

// Serializing a choice type as a map (one entry, key = case name)
let fromDomain (domainObj: Example) : IDictionary<string, obj> =
    match domainObj with
    | A -> [ ("A", null) ] |> dict
    | B i -> [ ("B", Nullable i :> obj) ] |> dict
    | C strList -> [ ("C", strList |> List.toArray :> obj) ] |> dict
    | D name -> [ ("D", nameDtoFromDomain name :> obj) ] |> dict
```

Deserialization uses a `getValue` helper:

```fsharp
let getValue key (dict: IDictionary<string, obj>) : Result<'a, string> =
    match dict.TryGetValue key with
    | true, value ->
        try (value :?> 'a) |> Ok
        with :? InvalidCastException ->
            Error (sprintf "Value at '%s' could not be cast to %s" key typeof<'a>.Name)
    | false, _ ->
        Error (sprintf "Key '%s' not found" key)
```

## Versioning DTOs

DTOs are contracts. Changing them can break consumers. Strategies:
- Add optional fields (backward compatible)
- Never remove fields in the same version
- Use a version number in the DTO if needed
- For events, consider event versioning (see Greg Young's "Versioning in an Event Sourced System")
