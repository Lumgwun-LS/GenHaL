---
name: VendorHub subscription reconciliation
description: How Stripe tier reconciliation is shared between the manual sync route and the periodic background job, and its known gap.
---

`reconcileVendorSubscription(vendor, stripe, source)` in `artifacts/api-server/src/lib/subscription-sync.ts` holds the
single implementation of "look at a vendor's Stripe subscriptions/checkout sessions and apply the highest active tier
found." Both `POST /vendors/:id/subscription/sync` (vendor/UI-triggered) and the periodic
`subscription-sync-scheduler.ts` job (every 30 min, covers vendors who never revisit the billing page) call this same
helper — do not re-duplicate the Stripe lookup logic in a new caller.

**Known gap:** the helper only ever raises a tier (applies an upgrade found on Stripe). If no active/trialing
subscription is found, it reports `synced: false` and leaves the vendor's existing tier untouched — it does not
downgrade to "free" on a missed cancellation. A follow-up task tracks closing this gap; check before assuming
reconciliation is symmetric.
