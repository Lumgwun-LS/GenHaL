---
name: Checkout idempotency guard
description: How duplicate checkout sessions for the same order are prevented across all payment providers.
---

## The Rule

Before opening a new checkout session for an `orderId`, always call `findActivePendingPayment(orderId)`. If a pending payment was created in the last 30 minutes, return its stored URL — do not open a second session.

**Why:** Concurrent double-click, frontend retry, or accidental re-submission can open two payment windows for the same order, leading to double-charges. Webhook dedup (logWebhookEvent) prevents double-recording, but doesn't prevent double-opening.

## Implementation

- `artifacts/api-server/src/lib/payment-guard.ts` — `findActivePendingPayment(orderId)` queries `paymentsTable` for recent pending payments
- `paymentsTable.createdAt` is `timestamp NOT NULL DEFAULT NOW()` — safe for `gte()` comparison

## How to apply

All four vendor checkout routes call the guard right after basic validation:
- `payments/stripe.ts` → `POST /payments/stripe/checkout`
- `payments/paystack.ts` → `POST /payments/paystack/initialize`
- `payments/paypal.ts` → `POST /payments/paypal/checkout`
- `payments/flutterwave.ts` → `POST /payments/flutterwave/checkout` (route handler only)

The `createFlutterwaveCheckout` shared function is also used by the public shop-link checkout (`public-post-links.ts`) — do NOT add the guard there since the public path has different retry semantics (explicit retry flow via `/orders/:orderId/retry`).

If adding a new payment provider, add the guard in its checkout route handler using the same pattern:
```typescript
if (orderId) {
  const existing = await findActivePendingPayment(orderId);
  if (existing?.checkoutUrl) {
    res.json({ paymentId: existing.id, reference: existing.providerReference, url: existing.checkoutUrl });
    return;
  }
}
```
