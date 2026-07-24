---
name: Payment checkout routes all auth-gated
description: All 6 vendor-initiated checkout route handlers now require Clerk auth; public customer-side flows use the shared helper functions directly.
---

## Rule
Every `POST /payments/<provider>/checkout` (or `/initialize`) route handler must:
1. Call `getAuth(req)` and return 401 if `!userId`
2. Look up the vendor via `clerkUserId` and return 403 if not found (non-admins)
3. Override `vendorId` with session-derived value (ignore body for non-admins)
4. If `orderId` provided: fetch order, verify `order.vendorId === vendorId`, use `parseFloat(order.totalAmount)` as amount

**Why:** All six checkout handlers (Flutterwave, PayPal, Remita, Nomba, Paystack, Stripe) previously accepted `vendorId` from the request body with no auth, allowing any authenticated user to initiate payment sessions on behalf of arbitrary vendors.

**How to apply:** The *shared helper functions* (`createNombaCheckout`, `createRemitaCheckout`, `createFlutterwaveCheckout`) intentionally stay auth-free — they are also called by `public-post-links.ts chargeProvider()` for unauthenticated customer shop-link flows. Only the route *handlers* get the auth wrapper.

**PayPal capture** (`POST /payments/paypal/capture`) is intentionally public — it is the OAuth-redirect callback; the `paypalOrderId` token is the PayPal-signed authorization proof.

## Provider status (as of 2026-07-24)
| Provider | Route | Auth fixed? |
|---|---|---|
| Flutterwave | POST /payments/flutterwave/checkout | ✅ (prior session) |
| PayPal | POST /payments/paypal/checkout | ✅ |
| Remita | POST /payments/remita/checkout | ✅ |
| Nomba | POST /payments/nomba/checkout | ✅ |
| Paystack | POST /payments/paystack/initialize | ✅ |
| Stripe | POST /payments/stripe/checkout | ✅ |
