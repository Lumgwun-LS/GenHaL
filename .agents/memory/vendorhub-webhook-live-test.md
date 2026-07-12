---
name: Testing real webhooks with platform gateway creds
description: How to exercise a live webhook route end-to-end (e.g. Paystack) using env-fallback secrets, for verifying downstream effects like push notifications.
---

## The pattern
VendorHub's payment gateway credentials can come from either an admin-configured DB row (`platform_payment_credentials`) or an env-var fallback (`resolveGatewayField` in `lib/platform-gateways.ts` checks DB first, then `ENV_FALLBACK`). When no admin credentials are configured yet, the env secrets (e.g. `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`) are authoritative.

This means you can test a webhook-driven flow (payment status update → notification → push) for real, without a live transaction:
1. Insert a `payments` row with a known `provider_reference` and status `pending` for the vendor you're testing.
2. Build the exact webhook JSON payload (e.g. `{ event: "charge.success", data: { reference, metadata } }`).
3. HMAC-sign the raw JSON body with the real webhook secret (`sha512` for Paystack) inside a `"use impure"` block — never print the secret.
4. POST the raw body plus the signature header directly to the running server's webhook route (e.g. `http://localhost:<port>/api/payments/paystack/webhook`), bypassing any proxy.
5. Check the DB row updated and check logs/ask the user to confirm the downstream effect (e.g. a push notification physically arriving).

## Why
This exercises the *real* code path (signature verification, idempotency/webhook-events logging, business logic, downstream side effects) rather than mocking it — much stronger evidence than manually calling internal functions, and doesn't require a real payment gateway transaction.
