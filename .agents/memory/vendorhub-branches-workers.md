---
name: VendorHub branches & workers
description: Branch office / worker as first-class entities linked into Sales, Expenses, Investments, Orders — filtering pattern and testing approach.
---

## What exists
`branches` and `workers` are vendor-scoped tables (worker optionally belongs to one branch). Sales, Expenses, Investments, and Orders each got nullable `branchId`/`workerId` FK columns (`onDelete: set null`) so deleting a branch/worker un-assigns rather than blocking or cascading. Confirmed live: deleting a worker/branch correctly nulls the FK on its linked records instead of erroring.

## Shared filter pattern
Built once, reused across all four resource pages instead of duplicating UI:
- `useDateRangeFilter` hook (`all|week|month|year|custom` → concrete ISO `from`/`to`, computed client-side).
- `finance-filters.tsx`: `DateRangeFilterControl` (preset selector), `BranchWorkerFilterControl` (list filtering), `BranchWorkerFormFields` (create/edit assignment).
**Why:** four nearly-identical filter bars is exactly the kind of duplication that drifts out of sync; a resource missing a filter later is now a one-line addition, not a copy-paste.
**How to apply:** any new listable resource that needs branch/worker/date-range/status filtering should reuse these three pieces, not reimplement them.

## Orders has no create dialog
Orders come from checkout, not manual creation, so branch/worker *assignment* went on the Order Detail page (a "Fulfillment" card with two Selects that PATCH immediately) while *filtering* went on the Orders list page. Don't assume every resource with new filter fields also needs a matching create-form field — check whether a create flow exists first.

## Live-testing auth without browser signup
Clerk's hosted sign-up page can hit a Cloudflare human-verification challenge that blocks Playwright-based testing subagents entirely (not app-specific, not always reproducible). Workaround for backend/API-level verification: use `CLERK_SECRET_KEY` via Backend API (`POST /v1/users` with `skip_password_checks`/`skip_password_requirement`, then `POST /v1/sessions`, then `POST /v1/sessions/{id}/tokens`) to mint a short-lived (~60s) session JWT, and pass it as `Authorization: Bearer <jwt>` to the app's own API. Mint a fresh token per call if any latency is possible — the token expires in ~60s. Delete the test Clerk user afterward (`DELETE /v1/users/{id}`) to avoid leaving throwaway accounts.

## Dev DB drift on `vendors` table (as of 2026-07-14)
Onboarding a brand-new vendor was completely broken: `vendors` was missing `remita_enabled`, `flutterwave_enabled`, `nomba_enabled` (migration 0019) and `push_payment_alerts_enabled`, `push_voice_campaign_alerts_enabled` (migration 0024) in the dev DB, surfacing one column at a time as each was hit. Applied both migrations' DDL directly. Separately, `POST /vendors/onboarding`'s success-response Zod parse (`OnboardVendorResponse`) still fails with `createdAt: invalid_type` (expects string, DB returns Date) — the vendor row **is** inserted correctly before that error, so the bug is response-serialization only; not yet fixed, unrelated to this session's scope, but blocks live onboarding testing (worked around by inserting the vendor row directly via SQL for continued testing).
