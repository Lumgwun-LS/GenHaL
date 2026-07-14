---
name: VendorHub payment reconciliation conflicts
description: How reconciliation conflicts (late webhook vs vendor-cancelled payment) are detected and now resolved by admins.
---

## Detection
`applyPaymentStatusTransition` in `artifacts/api-server/src/routes/payments/webhooks.ts` refuses to let a late webhook flip a vendor-cancelled payment back to paid/failed. On conflict it stores `metadata.reconciliationConflict = { attemptedStatus, provider, detectedAt }` on the payment row and fires a Slack alert, but leaves the row's `status` untouched.

## Admin resolution surface
`GET /admin/payment-conflicts` and `POST /admin/payment-conflicts/:id/resolve` (`artifacts/api-server/src/routes/admin.ts`) let an admin review and close these out. Resolution values: `dismiss` (keep current status), or `paid`/`failed`/`refunded` (override status to what the provider reported). Either way `reconciliationConflict.resolvedAt/resolvedBy/resolution` is set so the list query (`WHERE metadata->'reconciliationConflict'->>'resolvedAt' IS NULL`) excludes it going forward.

**Why:** conflicts are rare and manual by nature (a customer completing checkout on a stale link after cancellation) — there's no safe automatic resolution, so an admin must look at context and decide.

**How to apply:** if `applyPaymentStatusTransition`'s guard conditions change (e.g. a new payment status becomes cancel-like), keep the conflict detection and the admin resolve endpoint's `RESOLUTIONS` list in sync. If resolving to `paid`, reuse `syncSaleFromPayment`; any status change should call `notifyVendorPaymentStatus`, matching what a normal webhook transition would have done.
