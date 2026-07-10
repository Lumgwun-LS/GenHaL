---
name: VendorHub multi-gateway checkout/webhook pattern
description: How Remita/Flutterwave/Nomba checkout+webhook were wired in alongside Stripe/Paystack
---

The authoritative webhook pipeline (DB-outage buffering, dedup, admin retry) lives only in
`routes/payments/webhooks.ts` — per-provider files like `stripe.ts`/`paystack.ts` also define a
`/webhook` route but it's dead code, shadowed because `webhooks.ts` is mounted earlier
(before `requireAuth`) in `routes/index.ts`. New gateways should follow the same split:
checkout-initiation lives in its own `routes/payments/<provider>.ts` file (mounted after
`requireAuth` via `payments/index.ts`), webhook/callback logic + `process<Provider>Event` goes
in `webhooks.ts`, and any provider needing raw-body signature verification must be added to the
`express.raw()` path list in `app.ts` (JSON-signed webhooks like Remita's don't need this).

**Why:** avoids duplicating the outage-resilience/dedup machinery per provider, and matches
what's actually live in production (the shadowed per-file webhook routes would silently never fire).

Remita has no webhook signing — its callback is treated only as a "check now" trigger, and the
real confirmation comes from querying Remita's own status API with the merchantId/apiKey hash
before marking a payment paid.
