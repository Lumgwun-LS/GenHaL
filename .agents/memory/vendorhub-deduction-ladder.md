---
name: VendorHub auto-deduction threshold escalation
description: How the billing threshold scheduler uses a per-vendor escalating ladder instead of a hardcoded constant.
---

# Auto-Deduction Threshold Escalation

## The rule
Vendors start at `ladder[0]` (e.g. $10). After each successful auto-charge, their personal threshold advances to the next rung (stored in `vendors.currentDeductionThreshold`). Once at the top rung the threshold stays there. Failure does NOT advance — vendor gets billing-blocked instead.

**Why:** Mirrors Replit's billing model; reduces charge frequency for heavy users while keeping platform cash-flow safe.

## How to apply
- Ladder is stored in `billing.deductionLadder` site-content block (admin-editable, schema-validated in `site-content.ts`).
- Per-vendor current rung lives in `vendors.currentDeductionThreshold` (nullable numeric; NULL = use ladder[0]).
- Scheduler in `billing-threshold-scheduler.ts` reads ladder at each tick, filters vendors by their personal threshold, advances after successful charge.
- Admin can reset a vendor to NULL via `POST /admin/billing-enforcement/vendors/:id/reset-threshold`.
- UI: ladder editor + unsettled-overage table with reset button in `billing-enforcement.tsx`.
- Migration: `0072_vendor_deduction_threshold.sql`.
