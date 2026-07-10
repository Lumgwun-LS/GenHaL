---
name: VendorHub subscription billing model
description: How Stripe Customer + subscription checkout + Customer Portal are wired for vendor self-service billing
---

- Vendor subscription checkout uses Stripe **subscription mode** (not one-off payment mode), with a lazily-created Stripe Customer stored on `vendorsTable.stripeCustomerId`. The Stripe secret key is resolved via `resolveGatewayField("stripe", "secretKey")` (platform-gateways.ts), matching the webhook handler — not `process.env.STRIPE_SECRET_KEY` directly.
- Cancellation flows through the Stripe Customer Portal (`POST /vendors/:id/subscription/portal`), not a custom cancel button. The `customer.subscription.deleted` webhook event (added alongside the existing `checkout.session.completed` handling in `payments/webhooks.ts`) looks up the vendor by `stripeCustomerId` and resets `subscriptionTier` to `"free"`.
- **Why:** Reusing Stripe's own portal for invoices/payment-method/cancel avoids re-building billing UI and keeps cancellation-at-period-end semantics correct (Stripe fires `customer.subscription.deleted` only once the cancellation actually takes effect).
- **Known limitation:** in-portal plan *switching* isn't wired up, because checkout still creates ad-hoc Stripe prices via `price_data` rather than real Product/Price objects — Stripe's portal subscription-update feature needs real Prices. Plan switching still works via the existing upgrade-checkout flow outside the portal.
