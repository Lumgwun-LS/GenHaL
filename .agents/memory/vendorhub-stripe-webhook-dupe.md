---
name: Stripe webhook — two routers exist, only one is live
description: payments/stripe.ts contains a second, unreachable POST /payments/stripe/webhook handler; the real one is payments/webhooks.ts.
---

`routes/index.ts` mounts `paymentsWebhooksRouter` (from `payments/webhooks.ts`) publicly, before the
global `requireAuth` middleware. `paymentsRouter` (from `payments/index.ts`, which pulls in
`payments/stripe.ts`) is mounted *after* `requireAuth`.

Both files independently define `POST /payments/stripe/webhook`. Because Express matches the first
mounted route that responds, `webhooks.ts`'s handler always wins for real Stripe deliveries —
`stripe.ts`'s copy is dead code that would 401 on requireAuth if it were ever reached (Stripe never
sends a Clerk session).

**Why:** `stripe.ts` only implements `checkout.session.completed`; `webhooks.ts` implements the full
event set (`checkout.session.completed`, `customer.subscription.updated/deleted`, `charge.refunded`,
`checkout.session.expired`) plus the DB-outage buffering / idempotency-sentinel pipeline.

**How to apply:** When adding tests or new Stripe event handling, target `payments/webhooks.ts`
(`processStripeEvent` + the `/payments/stripe/webhook` route there), not `payments/stripe.ts`. If
`stripe.ts`'s duplicate webhook route is ever cleaned up, delete it rather than "fixing" it.
