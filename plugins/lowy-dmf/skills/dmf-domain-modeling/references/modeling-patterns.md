# Advanced Modeling Patterns

## Making Illegal States Unrepresentable

### Problem: Boolean flags with correlated optional fields

```fsharp
// BAD - IsEmail=true but EmailAddress=None is representable
type Contact = {
    IsEmail : bool
    EmailAddress : string option
    IsPhone : bool
    PhoneNumber : string option
}

// GOOD - impossible to have email without an address
type ContactInfo =
    | Email of EmailAddress
    | Phone of PhoneNumber

type Contact = {
    ContactId : ContactId
    Info : ContactInfo
}
```

### Problem: States that should be mutually exclusive

```fsharp
// BAD - can have both PaidDate and RefundDate
type Invoice = {
    InvoiceId : InvoiceId
    IsPaid : bool
    PaidDate : DateTime option
    IsRefunded : bool
    RefundDate : DateTime option
}

// GOOD - states are explicit and mutually exclusive
type InvoiceState =
    | Unpaid
    | Paid of paidDate: DateTime
    | Refunded of paidDate: DateTime * refundDate: DateTime
```

### Problem: Lifecycle stages sharing a single type

```fsharp
// BAD - ValidatedDate can be None even after "validation"
type Order = {
    OrderId : string
    IsValidated : bool
    ValidatedDate : DateTime option
    IsPriced : bool
    TotalPrice : decimal option
}

// GOOD - separate types per stage, impossible to skip stages
type UnvalidatedOrder = { OrderId: string; Lines: UnvalidatedOrderLine list }
type ValidatedOrder = { OrderId: OrderId; Lines: ValidatedOrderLine list }
type PricedOrder = { OrderId: OrderId; Lines: PricedOrderLine list; Total: BillingAmount }
```

## Modeling Optional vs. Required

Use `option` only when the domain genuinely allows absence:

```fsharp
type Address = {
    AddressLine1 : String50           // required
    AddressLine2 : String50 option    // genuinely optional
    AddressLine3 : String50 option    // genuinely optional
    City : String50                   // required
    ZipCode : ZipCode                 // required
}
```

Never use `option` as a substitute for "not yet provided" - that means you need
a separate type for the "incomplete" stage.

## Modeling Collections with Constraints

If a list must be non-empty:

```fsharp
type NonEmptyList<'a> = {
    First : 'a
    Rest : 'a list
}

type ValidatedOrder = {
    OrderId : OrderId
    Lines : NonEmptyList<ValidatedOrderLine>  // at least one line required
}
```

## Cross-Aggregate References

Aggregates reference each other by ID, never by embedding.

```fsharp
// WRONG - embedding the full Customer inside Order
type Order = {
    Customer : Customer    // tight coupling, consistency nightmare
    Lines : OrderLine list
}

// RIGHT - reference by ID
type Order = {
    CustomerId : CustomerId  // just the reference
    Lines : OrderLine list
}
```

## State Machine Pattern

When an entity has a lifecycle with distinct states:

```fsharp
type UnpaidInvoice = {
    InvoiceId : InvoiceId
    Amount : BillingAmount
}

type PaidInvoice = {
    InvoiceId : InvoiceId
    Amount : BillingAmount
    PaidDate : DateTime
}

// Transitions are functions
type PayInvoice = UnpaidInvoice -> Payment -> PaidInvoice
type RefundInvoice = PaidInvoice -> RefundedInvoice
```

Each state is its own type. Transitions are function types. The compiler prevents
calling `RefundInvoice` on an `UnpaidInvoice`.

## Modeling Commands and Events

Commands are requests (imperative). Events are facts (past tense).

```fsharp
// Commands - input to a workflow
type PlaceOrder = {
    OrderForm : UnvalidatedOrder
}

type ChangeOrder = {
    OrderId : OrderId
    Changes : UnvalidatedOrderChanges
}

// Top-level command type for the bounded context
type OrderTakingCommand =
    | PlaceOrder of PlaceOrder
    | ChangeOrder of ChangeOrder
    | CancelOrder of CancelOrder

// Events - output of a workflow
type OrderPlaced = PricedOrder

type BillableOrderPlaced = {
    OrderId : OrderId
    BillingAddress : Address
    AmountToBill : BillingAmount
}

type OrderAcknowledgmentSent = {
    OrderId : OrderId
    EmailAddress : EmailAddress
}

type PlaceOrderEvent =
    | OrderPlaced of OrderPlaced
    | BillableOrderPlaced of BillableOrderPlaced
    | AcknowledgmentSent of OrderAcknowledgmentSent
```

## Modeling the Overall Workflow Signature

The public API of a bounded context workflow:

```fsharp
// The top-level workflow function type
type PlaceOrderWorkflow =
    PlaceOrder                                        // command input
      -> AsyncResult<PlaceOrderEvent list, PlaceOrderError>  // output

// Error type is a union of all possible failures
type PlaceOrderError =
    | Validation of ValidationError list
    | Pricing of PricingError
    | RemoteService of RemoteServiceError
```

## Units of Measure (F# specific)

For numeric domains where unit confusion is dangerous:

```fsharp
[<Measure>] type kg
[<Measure>] type m
[<Measure>] type s

type Weight = decimal<kg>
type Distance = decimal<m>
type Speed = decimal<m/s>

// Compiler prevents adding kg to meters
let totalWeight (w1: Weight) (w2: Weight) : Weight = w1 + w2
```

## Wrapper Types for Checked/Validated Markers

Use single-case DUs as "proof" that validation occurred:

```fsharp
type CheckedAddress = CheckedAddress of UnvalidatedAddress

type CheckAddressExists =
    UnvalidatedAddress -> AsyncResult<CheckedAddress, AddressValidationError>
```

The `CheckedAddress` wrapper is proof that the address was checked.
Downstream code can require `CheckedAddress` and the compiler ensures
the check actually happened.
