---
name: Shared analytics computation for admin rollups
description: How to add a platform-wide (cross-vendor) admin analytics view without duplicating per-vendor computation logic.
---

## The pattern
When a per-vendor analytics endpoint (e.g. `/analytics/finance-overview` in `analytics.ts`) needs an admin-facing "across all vendors" counterpart, extract the core computation (revenue trend, P&L, category breakdown, ROI, cash-flow forecast, etc.) into a standalone pure function that takes plain row arrays + a date range and returns the computed shape — no DB access, no request/response coupling.

**Why:** Keeps one source of truth for the business logic (bucketing, rounding, forecast math) so the per-vendor route and the admin rollup route can never drift apart. The admin route just fetches rows for *all* vendors (optionally grouped for a per-vendor breakdown table) and feeds them through the same function.

**How to apply:** New admin cross-entity aggregation features should follow this same shape: (1) find/extract the existing per-entity pure computation, (2) call it once with the full unfiltered dataset for the aggregate view, (3) call it again per-group (e.g. per vendorId) only when an optional `?breakdown=true` flag is passed, since the full per-vendor time-series is usually unnecessary — a flat per-vendor summary row (totals only) is enough for an admin table.

## Dev DB drift note
Building the admin route often means selecting the full `vendorsTable` row (for names/joins) for the first time in that code path — this surfaces any not-yet-applied vendor-column migrations even if unrelated to the new feature. Check `lib/db/migrations/` for anything with `vendors ADD COLUMN` before assuming a 500 is your own new code's bug.
