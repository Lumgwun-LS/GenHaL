---
name: VendorHub finance suite (Sales, Expenses, Investments, Analytics)
description: How the finance suite tables/routes/pages relate, and the auto-sync + analytics design decisions.
---

- `sales` rows come from two sources: manual (vendor-entered) and `order_payment` (auto-synced). `source` + a unique `sourcePaymentId` distinguish them; auto rows are read-only in the API (PATCH/DELETE reject non-manual) and in the UI (edit/delete hidden).
- Auto-sync (`syncSaleFromPayment` in `lib/sales-sync.ts`) is called from the single centralized `applyPaymentStatusTransition` in `payments/webhooks.ts`, not from each provider's webhook handler — this covers all payment providers (Stripe, Paystack, Flutterwave, Nomba, Remita) and admin retries in one place. Idempotency is enforced at the DB level via `onConflictDoNothing` on the unique `sourcePaymentId`, verified live: two calls with the same payment id produce exactly one sales row.
- `expenses` are manual-only with a fixed category list (Inventory, Marketing, Utilities, Rent, Payroll, Shipping, Software, Fees, Travel, Other) shared between backend validation and frontend filters/forms.
- `investments` cover both owner-capital and external assets via a `type` enum (owner_capital, loan, equity, external_asset) plus `status` (active/closed); ROI is computed per-row from `currentValue` vs `amount`, defaulting `currentValue` to `amount` when unset.
- `/analytics/finance-overview` combines all 5 analytics views (revenue trend, P&L by day, expense breakdown by category, investment ROI, cash-flow forecast) into one response rather than 5 separate endpoints — cash-flow forecast is a simple linear projection using the average daily net over the selected range, extended forward up to 30 days with an `isForecast` flag per point.
- CSV export routes for these 3 resources are unbatched (unlike admin.ts's 500-row batching) — an intentional scope call assuming small per-vendor datasets; revisit if a vendor's history grows large (see follow-up task).
