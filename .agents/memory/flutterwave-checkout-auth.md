---
name: Flutterwave checkout auth and amount spoofing
description: POST /payments/flutterwave/checkout had no auth and accepted amount from request body; fixed to match PayPal pattern.
---

## The Vulnerability (Fixed)

`POST /payments/flutterwave/checkout` route:
- Had no auth check — any unauthenticated request could initiate a checkout
- Accepted `vendorId` and `amount` from the request body — amount spoofing possible
- Could not verify the calling user owns the orderId

## The Fix

The route handler (not `createFlutterwaveCheckout` which is shared with public paths) now:
1. Requires Clerk auth: `getAuth(req)` → 401 if missing
2. Derives `vendorId` from Clerk session (not body): resolves via `clerkUserId` lookup
3. If `orderId` is provided: fetches order from DB, verifies `order.vendorId === authedVendor.id`, uses `order.totalAmount` (not body amount)

**Why:** `createFlutterwaveCheckout` is also called by the public shop-link checkout (unauthenticated customer path) so it cannot be modified to require auth. The protection must live in the route handler.

## Pattern to apply to new gateways

New payment gateway checkout routes must follow this pattern (same as PayPal fix):
1. Auth + vendorId-from-session
2. If orderId present: ownership + server amount
3. Checkout dedup guard (see checkout-dedup-guard.md)
