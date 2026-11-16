# Plan: Discount Codes

> Source: Let customers redeem a discount code at checkout; cc-docs/design/shop/03-layered-architecture.md; cc-docs/architecture.md
> Status: reviewed
> Revision: 3, 2026-11-14

## 1. Goal

Customers enter a discount code at checkout and see the reduced total before they pay.
Support staff create codes with a percentage and an expiry date.
It works when a valid code lowers the total and an expired or unknown code is refused with a reason.

## 2. Scope

**In scope**

- Percentage codes with an expiry date.
- Redeeming one code per order.

**Out of scope**

- Fixed-amount codes.
- Stacking several codes on one order.

## 3. Use Cases

### UC-1: Redeem a code at checkout

- **Trigger:** a customer enters a code on the checkout page.
- **Steps:** the code is looked up, checked against its expiry, and applied to the order total.
- **Outcome:** the order shows the discount and the reduced total.
- **Failures:** an unknown code shows "This code does not exist"; an expired code shows "This code expired on <date>".

### UC-2: Create a code

- **Trigger:** a support agent submits the new code form.
- **Steps:** the code, its percentage and its expiry are validated and stored.
- **Outcome:** the code can be redeemed until it expires.
- **Failures:** a percentage outside 1 to 90 is refused; a code that exists is refused.

## 4. Architecture Impact (Löwy)

### 4.1 Services

| Service | Layer | Change | File | Why |
|---|---|---|---|---|
| OrderManager | Manager | changed | src/Orders/OrderManager.cs | Applies the code during checkout |
| PricingEngine | Engine | changed | src/Pricing/PricingEngine.cs | Computes the discounted total |
| DiscountAccess | ResourceAccess | new | | Stores and finds codes |

### 4.2 Volatility

Pricing rules are the axis, and PricingEngine already encapsulates it.

### 4.3 Call Chains

**UC-1**

| Hop | Caller | Callee | Kind |
|---|---|---|---|
| 1 | CheckoutClient | OrderManager.ApplyCode | sync |
| 2 | OrderManager | DiscountAccess.Find | sync |
| 3 | OrderManager | PricingEngine.Discount | sync |

**UC-2**

| Hop | Caller | Callee | Kind |
|---|---|---|---|
| 1 | SupportClient | OrderManager.CreateCode | sync |
| 2 | OrderManager | DiscountAccess.Store | sync |

### 4.4 Messaging

No messaging changes.

## 5. Domain Model Impact (DMF)

### 5.1 Types

```csharp
public sealed record DiscountCode(CodeText Text, Percentage Rate, DateOnly Expires);
```

`Percentage` rules out a rate outside 1 to 90.

### 5.2 Workflows

```csharp
Result<PricedOrder, DiscountError> ApplyCode(FindCode find, Today today, Order order, CodeText code);
```

### 5.3 Errors

`DiscountError` has `UnknownCode`, `ExpiredCode` and `InvalidRate`.

### 5.4 Boundaries

`DiscountCodeDto` maps to a new `discount_codes` table, so no data is migrated.

## 6. Phases

### Phase 1: Discount types and pricing

- **Goal:** the discounted total of an order can be computed in pure code.
- **Depends on:** none
- **Changes:** `DiscountCode`, `Percentage` and `DiscountError` (§5.1, §5.3); `PricingEngine.Discount` (§4.1).
- **Acceptance criteria:**
  - `AC-1.1` `dotnet test --filter Discount` passes, with a property test that a discount never raises a total.
  - `AC-1.2` `Percentage.Create(95)` returns `InvalidRate`.
- **Tests:**
  - property: a discount never raises a total.
  - unit: rates outside 1 to 90 are refused.
- **Status:** pending

### Phase 2: Redeem and create codes

- **Goal:** UC-1 and UC-2 work end to end through OrderManager.
- **Depends on:** Phase 1
- **Changes:** `DiscountAccess` (§4.1, §5.4); `OrderManager.ApplyCode` and `OrderManager.CreateCode` (§4.3).
- **Acceptance criteria:**
  - `AC-2.1` an integration test redeems a valid code and sees the reduced total.
  - `AC-2.2` an integration test redeems an expired code and gets `ExpiredCode`.
- **Tests:**
  - integration: redeem a valid code, an expired code and an unknown code.
  - integration: create a code twice.
- **Status:** pending

## 7. Verification

### 7.1 Commands

```
dotnet build Shop.sln
dotnet test Shop.sln
```

### 7.2 Scenarios

1. **Redeem a code** (UC-1): create a 10% code; add a 50.00 item to the cart; enter the code at checkout; the total reads 45.00.
2. **Create a code** (UC-2): submit a code with a 95% rate; the form says the rate must be between 1 and 90.

## 8. Risks, Assumptions and Open Questions

### Risks

- A code redeemed twice at once: the redemption is checked inside the order's transaction.

### Assumptions

- Codes are case-insensitive, as order numbers are.

### Open Questions

- `Q-2` Should support staff see how often a code was redeemed?
  - **Options:** a count on the code's page; no count in this feature
  - **Recommendation:** no count in this feature, because nobody asked for reporting yet
  - **Depends on it:** §2, Phase 2

### Settled by Probe

- `Q-1` Does the payment provider accept a total with a fraction of a cent?
  - **Observed:** the sandbox rejected 44.995 and accepted 45.00.
  - **Evidence:** `curl -s sandbox.example/charge -d amount=44.995` printed `invalid_amount`.
  - **Decision:** round half up to the cent before payment; applied in §5.2 and AC-1.1.

## 9. Decision Log

Q-1 settled by probe, 2026-11-13: round half up to the cent; applied in §5.2, Phase 1.

#### Round 1, 2026-11-14 (discount-codes-plan-review-2026-11-14-round-1.md)

| Finding | Lens | Severity | Ruling | Reason | Applied in |
|---|---|---|---|---|---|
| D-1 | dmf | major | accepted | The rate was a bare int | §5.1, Phase 1 |
| P-2 | plan | minor | asked | Reporting is a product call | Q-2 |
