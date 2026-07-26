---
name: Subscription refund + blacklist
description: When a vendor cancels within 10 days, auto-refund via original gateway and blacklist them from re-subscribing to the same or lower tier.
---

## The rule
`REFUND_WINDOW_DAYS = 10` — measured from `vendor.currentPeriodStart` (set whenever `subscriptionTier` changes in `subscription-sync.ts`).

## Where it lives
- **Core lib**: `artifacts/api-server/src/lib/subscription-refund.ts` — `maybeRefundSubscriptionCancellation(vendor, gateway, ctx)`
- **DB table**: `subscription_refund_blacklist` (migration 0080) — `vendor_id`, `refunded_tier`, `min_allowed_tier`, `min_allowed_tier_rank`, `gateway`, `refund_reference`
- **Webhook hooks** (fire-and-forget void IIFE in `payments/webhooks.ts`):
  - Stripe `customer.subscription.deleted` — passes `stripeCustomerId` + `stripeSubscriptionId` in ctx
  - Paystack `subscription.disable` / `subscription.not_renew` — passes `event.data.most_recent_invoice?.transaction?.reference` as `paystackTransactionRef`
  - PayPal `BILLING.SUBSCRIPTION.CANCELLED` only (not EXPIRED/SUSPENDED)
- **Checkout guard**: `subscription-upgrade.ts` — after the existing tier-rank guard, queries blacklist and returns 409 if `targetRank < minAllowedTierRank`
- **Plans endpoint**: returns `blacklistMinTier`, `blacklistMinTierRank`, `blacklistRefundedTier` so the frontend can grey out unavailable tiers
- **Admin**: `GET /admin/subscription-refund-blacklist` (list) + `DELETE /admin/subscription-refund-blacklist/:id` (pardon)

## Stripe Invoice type gap (SDK v22)
`Invoice.payment_intent` isn't in the TypeScript types for Stripe SDK v22; access via `(invoice as unknown as Record<string, unknown>).payment_intent`.

## Paystack refund
Uses `POST https://api.paystack.co/refund` with `{ transaction: ref }`. The `ref` comes from `event.data.most_recent_invoice.transaction.reference` in the webhook payload.

## PayPal refund
`GET /v1/billing/subscriptions/{id}/transactions?start_time=...&end_time=now` → find latest COMPLETED transaction → `POST /v2/payments/captures/{sale_id}/refund`.

**Why:** The captures v2 endpoint works for both checkout captures and subscription sales.

## Blacklist semantics
`minAllowedTierRank = TIER_RANK[refundedTier] + 1` (capped at 3 = enterprise).
Checkout checks `targetRank >= minAllowedTierRank`; plans endpoint exposes it so UI can grey tiers.

## Always fire-and-forget
The refund helper is always called in a `void (async () => { ... })()` IIFE inside webhook handlers so a gateway failure never blocks the tier downgrade path.
