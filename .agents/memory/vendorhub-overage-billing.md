---
name: VendorHub pay-as-you-go overage billing
description: How overage (pay-as-you-go) works when a paid vendor exhausts their included monthly credits.
---

# VendorHub Overage Billing

## The rule
Paid-tier vendors (starter/pro/enterprise) are **never hard-blocked** when they exhaust plan credits. Extra usage is allowed and charged at published overage rates. Free-tier vendors are still hard-blocked — no payment method on file.

## Overage rates (USD per unit)
Defined in `artifacts/api-server/src/lib/usage.ts` as `OVERAGE_RATES`:
- aiImages: $0.50, aiVideos: $1.00, aiCaptions: $0.05
- voiceMinutes: $0.15, sms: $0.05, email: $0.01
(≈ 2.5-3× platform cost for healthy margin)

## How it flows
1. `consumeQuota`/`consumeQuotaTx` → if remaining < amount AND paid tier → mark `isOverage: true`, allow usage, consume remaining included credits, track rest as overage
2. `recordOverageCharge()` is called fire-and-forget after the TX to upsert `vendor_overage_charges` and create a Stripe `InvoiceItem` if vendor has `stripeCustomerId`
3. Non-Stripe vendors: overage accumulates in DB for manual/end-of-period settlement
4. `QuotaCheckResult` now includes `isOverage`, `overageUnits`, `overageUsd` fields

## DB table
`vendor_overage_charges` — one row per (vendor_id, resource, period_start), UPSERT accumulation. `stripe_invoice_item_id` set on first Stripe hit per period/resource.

**Why:** The original hard-block approach lost revenue and frustrated paid customers — overage billing keeps them working and monetizes heavy usage at margin.

**How to apply:** Any new metered resource route should call `consumeQuota` and check `result.isOverage` to optionally show the vendor a warning. The Stripe invoice item is created automatically.
