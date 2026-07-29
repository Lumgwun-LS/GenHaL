---
name: Vendor Feature Trial System
description: Admin-granted feature-level trial on the Awa Biz Suite — how it works, what was built, and the grant/revoke flow.
---

# Vendor Feature Trial System

## What was built
- 5 new columns added to `vendors` table (migration `0099_vendor_feature_trial.sql`):
  `feature_trial_tier`, `feature_trial_expires_at`, `feature_trial_granted_by`, `feature_trial_granted_at`, `feature_trial_note`
- `getEffectiveTier()` in `lib/usage.ts` now prefers the trial tier over `subscriptionTier` when the trial is active and unexpired
- Admin API routes in `artifacts/api-server/src/routes/admin.ts`:
  - `GET /admin/feature-trials` — list all vendors with active trials
  - `POST /admin/feature-trials/:vendorId` — grant (body: `{tier, days, note}`)
  - `DELETE /admin/feature-trials/:vendorId` — revoke
- Dashboard banner in `artifacts/vendor-hub/src/pages/dashboard.tsx` — shows trial tier + days remaining when a trial is active

## Key design decisions

**Why columns on vendors table (not a separate table):**
- Simpler for the subscription sync to read — it already fetches the full vendor row
- Trial is one-active-at-a-time per vendor; no need for multi-row history
- A separate history table can be added later if needed

**Why:** keeps `getEffectiveTier()` stateless and fast (no extra DB query needed).

**How to apply:**
- Grant: POST /admin/feature-trials/:vendorId with `{tier: "pro", days: 7, note: "..."}`
- Revoke: DELETE /admin/feature-trials/:vendorId
- Tier is the higher of `featureTrialTier` and `subscriptionTier` — a pro subscriber getting a trial stays on pro

## Production trial grant (ataisijohnny1@gmail.com)
Needs to be done after Publish (schema migration applies to production DB first).
Use `executeSql({ environment: "production", sqlQuery: "UPDATE vendors SET feature_trial_tier='pro', feature_trial_expires_at = NOW() + INTERVAL '7 days', ... WHERE email='ataisijohnny1@gmail.com'" })`
