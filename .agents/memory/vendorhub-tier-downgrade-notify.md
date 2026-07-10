---
name: Tier-downgrade notification pattern
description: How VendorHub notifies vendors when a webhook drops their subscription back to the free tier
---

Whenever a Stripe webhook (or similar) sets `vendorsTable.subscriptionTier` to `"free"` (subscription cancellation, refund of a paid subscription charge, etc.), pair the downgrade with two notifications:

1. Insert a `vendorNotificationsTable` row with `type: "tier_change"` and a plain-English message naming the previous tier — this is the in-app notification pattern already used by the `charge.refunded` handler.
2. Send an email via `sendEmail` (mailer.ts) wrapped in `wrapVendorEmail`, listing the features the vendor loses by looking up the previous tier in `SUBSCRIPTION_PLANS` (subscription-upgrade.ts) and rendering `plan.features`.

**Why:** vendors could otherwise lose paid features silently; the refund path already had the in-app notification, so the cancellation path was made consistent with it plus an email for stronger visibility.

**How to apply:** capture the vendor's `subscriptionTier` (and email/name) via a SELECT *before* the UPDATE that flips it to free, since the previous value is needed for both messages. Guard the email send on `vendor.email` being present.
