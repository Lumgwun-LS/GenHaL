---
name: Reconciliation must go both directions
description: Any "sync against provider" job must handle the provider saying less than we believe, not just more.
---

A dropped/missed webhook is symmetric: it can cause a missed upgrade (provider says more than our DB) or a missed downgrade/cancellation (provider says less). A reconciliation job that only raises entitlement when the provider confirms it, but never lowers entitlement when the provider stops confirming it, leaves users with stale access indefinitely after a real-world cancellation the platform never heard about.

**Why:** built to close exactly that gap for VendorHub's Stripe tier sync — the existing job only handled the upgrade direction.

**How to apply:** when building or reviewing a reconciliation job against any external system of record, reuse the same user-facing notification path for the "provider says less" branch as for the equivalent webhook-driven event, so the user sees identical messaging regardless of which path caught it.
