# Simple Constrained Types - Full Pattern Catalog

## Base Pattern

Every simple type follows this structure:

```fsharp
type TypeName = private TypeName of PrimitiveType

module TypeName =
    let create (input: PrimitiveType) : Result<TypeName, string> =
        // validate
        // return Ok or Error

    let value (TypeName inner) = inner
```

## String Types

### Non-empty string with max length

```fsharp
type String50 = private String50 of string

module String50 =
    let create fieldName str =
        if String.IsNullOrEmpty(str) then
            Error (sprintf "%s must not be null or empty" fieldName)
        elif str.Length > 50 then
            Error (sprintf "%s must not be more than 50 chars" fieldName)
        else
            Ok (String50 str)

    /// For optional fields: null/empty → None, valid → Some
    let createOption fieldName str =
        if String.IsNullOrEmpty(str) then
            Ok None
        elif str.Length > 50 then
            Error (sprintf "%s must not be more than 50 chars" fieldName)
        else
            Ok (Some (String50 str))

    let value (String50 str) = str
```

Repeat for `String100`, `String200`, etc. as needed.

### Pattern-validated strings

```fsharp
type EmailAddress = private EmailAddress of string

module EmailAddress =
    let create str =
        if String.IsNullOrEmpty(str) then
            Error "Email must not be empty"
        elif System.Text.RegularExpressions.Regex.IsMatch(str, ".+@.+")  then
            Ok (EmailAddress str)
        else
            Error (sprintf "Invalid email: '%s'" str)

    let value (EmailAddress str) = str

type ZipCode = private ZipCode of string

module ZipCode =
    let create str =
        if String.IsNullOrEmpty(str) then
            Error "ZipCode must not be empty"
        elif System.Text.RegularExpressions.Regex.IsMatch(str, @"^\d{5}$") then
            Ok (ZipCode str)
        else
            Error (sprintf "Invalid zip code: '%s'" str)

    let value (ZipCode str) = str
```

### Identifier strings (OrderId, ProductCode, etc.)

```fsharp
type OrderId = private OrderId of string

module OrderId =
    let create str =
        if String.IsNullOrEmpty(str) then
            Error "OrderId must not be null or empty"
        elif str.Length > 50 then
            Error "OrderId must not be more than 50 chars"
        else
            Ok (OrderId str)

    let value (OrderId str) = str
```

For identifiers that have subtype structure:

```fsharp
type WidgetCode = private WidgetCode of string

module WidgetCode =
    let create code =
        if System.Text.RegularExpressions.Regex.IsMatch(code, @"^W\d{4}$") then
            Ok (WidgetCode code)
        else
            Error (sprintf "Invalid widget code: '%s'" code)

    let value (WidgetCode code) = code

type GizmoCode = private GizmoCode of string

module GizmoCode =
    let create code =
        if System.Text.RegularExpressions.Regex.IsMatch(code, @"^G\d{3}$") then
            Ok (GizmoCode code)
        else
            Error (sprintf "Invalid gizmo code: '%s'" code)

    let value (GizmoCode code) = code

// Composite product code
type ProductCode =
    | Widget of WidgetCode
    | Gizmo of GizmoCode

module ProductCode =
    let create (code: string) =
        if String.IsNullOrEmpty(code) then
            Error "ProductCode must not be null or empty"
        elif code.StartsWith("W") then
            WidgetCode.create code |> Result.map Widget
        elif code.StartsWith("G") then
            GizmoCode.create code |> Result.map Gizmo
        else
            Error (sprintf "Product code must start with 'W' or 'G': '%s'" code)

    let value = function
        | Widget (WidgetCode code) -> code
        | Gizmo (GizmoCode code) -> code
```

## Numeric Types

### Integer with range

```fsharp
type UnitQuantity = private UnitQuantity of int

module UnitQuantity =
    let create qty =
        if qty < 1 then
            Error "UnitQuantity must not be less than 1"
        elif qty > 1000 then
            Error "UnitQuantity must not be more than 1000"
        else
            Ok (UnitQuantity qty)

    let value (UnitQuantity qty) = qty
```

### Decimal with range

```fsharp
type KilogramQuantity = private KilogramQuantity of decimal

module KilogramQuantity =
    let create qty =
        if qty < 0.05m then
            Error "KilogramQuantity must not be less than 0.05"
        elif qty > 100.0m then
            Error "KilogramQuantity must not be more than 100.0"
        else
            Ok (KilogramQuantity qty)

    let value (KilogramQuantity qty) = qty
```

### Non-negative decimal (Price, BillingAmount)

```fsharp
type Price = private Price of decimal

module Price =
    let create amount =
        if amount < 0m then
            Error "Price must not be negative"
        elif amount > 1000000m then
            Error "Price must not be more than 1,000,000"
        else
            Ok (Price amount)

    let value (Price amount) = amount

    let multiply qty (Price p) =
        create (qty * p)

type BillingAmount = private BillingAmount of decimal

module BillingAmount =
    let create amount =
        if amount < 0m then
            Error "BillingAmount must not be negative"
        elif amount > 10000m then
            Error "BillingAmount must not be more than 10,000"
        else
            Ok (BillingAmount amount)

    let value (BillingAmount amount) = amount

    let sumPrices (prices: Price list) =
        let total = prices |> List.map Price.value |> List.sum
        create total
```

## Composite Choice Types (OrderQuantity pattern)

When a domain concept has mutually exclusive representations:

```fsharp
type OrderQuantity =
    | Unit of UnitQuantity
    | Kilogram of KilogramQuantity

module OrderQuantity =
    let value = function
        | Unit uq -> UnitQuantity.value uq |> decimal
        | Kilogram kq -> KilogramQuantity.value kq
```

## Date/Time Types

```fsharp
type Birthdate = private Birthdate of DateTime

module Birthdate =
    let create (dt: DateTime) =
        if dt < DateTime(1900, 1, 1) then
            Error "Birthdate must not be before 1900"
        elif dt > DateTime.Now then
            Error "Birthdate must not be in the future"
        else
            Ok (Birthdate dt)

    let value (Birthdate dt) = dt
```

## Generic Helpers

### Creating constrained types from options (for nullable DB/DTO fields)

```fsharp
module Result =
    let bindOption f = function
        | Some x -> f x |> Result.map Some
        | None -> Ok None

    let ofOption errorValue = function
        | Some v -> Ok v
        | None -> Error errorValue
```

### Using `createOption` for optional fields in validation

```fsharp
// In a validation function:
let! addressLine2 =
    unvalidated.AddressLine2
    |> String50.createOption "AddressLine2"  // null/empty → Ok None, valid → Ok (Some ...)
```
