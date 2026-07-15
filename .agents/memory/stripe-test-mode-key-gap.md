---
name: No Stripe secret key configured for VendorHub
description: Platform has no Stripe key (DB platform_payment_credentials or STRIPE_SECRET_KEY env) — live Stripe checks need one requested from the user first.
---

As of 2026-07-15, `platform_payment_credentials` has no row for provider `stripe`, and `STRIPE_SECRET_KEY` is not in the available env secrets. `resolveGatewayField("stripe", "secretKey")` therefore returns undefined at runtime — Stripe-dependent routes (checkout, portal, sync) 503 until an admin configures it in-app or the env var is set.

**Why:** discovered while trying to validate the subscription reconciliation (missed-cancellation) logic against Stripe's real test-mode API — there was no key available to do so, so the check had to be built as a manual opt-in script instead of an automated one.

**How to apply:** before attempting any task that needs to hit the real Stripe API (not just mocked tests), check `platform_payment_credentials` and env secrets first; if neither has a key, ask the user whether to provide a test-mode key (`sk_test_...`) via `requestSecrets`/the DB admin UI, or proceed with a simulated/mocked version instead. See `artifacts/api-server/src/lib/__tests__/live-stripe-lifecycle-check.ts` for a ready-to-run script once a key exists.
