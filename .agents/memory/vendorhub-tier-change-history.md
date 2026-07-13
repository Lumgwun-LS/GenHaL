---
name: VendorHub admin plan-change history
description: How vendor subscription tier upgrade/downgrade history is stored and surfaced to admins.
---

Vendor-facing tier-change notifications store structured previous/new tier values, not just a
human-readable message string.

**Why:** the same notification "type" value is reused for an unrelated admin edit (a non-tier
field), so filtering/rendering off the message text alone is fragile and would leak unrelated
rows into any admin/vendor view that expects only real plan changes.

**How to apply:** any new code path that changes a vendor's subscription tier and notifies them
should populate the structured previous/new tier fields (via the shared notification helper)
rather than composing a new ad-hoc message, so it shows up correctly in tier-change-specific
views without text parsing.
