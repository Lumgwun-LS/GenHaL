---
name: VendorHub push notification categories
description: Design rule for per-category push opt-out (payments, voice campaigns, future types).
---

Push preferences are per-category boolean vendor columns (default `true`), matching the existing
single-purpose boolean pattern rather than a generic JSON blob. The opt-out check lives inside the
shared push-sending helper (keyed by a category enum), not in each call site.

**Why:** every category must default to "on" so existing vendors see no behavior change, and
centralizing the check means a new event type physically cannot bypass a vendor's opt-out by
forgetting to add a per-call-site check.

**How to apply:** adding a new push-triggering event = new default-true boolean column + new
category enum entry + pass that category when sending. Migrations here are hand-written SQL files
in `lib/db/migrations` (no drizzle-kit journal/meta) — always add one alongside any vendors-table
schema change, not just `drizzle-kit push` against dev.
