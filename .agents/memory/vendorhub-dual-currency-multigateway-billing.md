---
name: VendorHub dual-currency multi-gateway subscription billing
description: Design of NGN+USD plan pricing and admin-controlled Stripe/Paystack gateway toggle for platform subscriptions.
---

## Shape
- Plans moved from `price`/`currency` to `pricing: { usd, ngn }` on every plan (site-content `billing.subscriptionPlans`, `SubscriptionPlan` type, Stripe/Paystack catalogs, admin editor, vendor upgrade card).
- New site-content block `billing.paymentGateways: { stripe: boolean, paystack: boolean }` (default both true) gates which gateways vendors can subscribe with. Server-side Zod `.refine()` rejects disabling all gateways (defense in depth beyond the admin UI's "keep at least one enabled" guard) — a `.object()` schema alone does NOT enforce this, a bare boolean pair can legally both be false unless refined.
- Currency is tied 1:1 to gateway (Stripe→USD, Paystack→NGN), not independently selectable. Not explicitly reconfirmed with the user after the UI shipped — revisit if they push back.

## Paystack specifics
- Paystack Plans are mutable; `paystack-catalog.ts` lists/updates existing Plans by name match (not by a stored ID), with a 30s in-memory cache — different from Stripe's immutable-Price-swap-on-price-change pattern.
- Cancellation is immediate (`/subscription/disable` → instant downgrade via a dedicated `/vendors/:id/subscription/paystack/cancel` route) — a deliberate scope simplification vs. Stripe's portal-based "cancel at period end."
- Webhook order relied upon: `charge.success` sets `paystackCustomerCode` before `subscription.create` arrives and matches on it — this is Paystack's normal delivery order, not something we control.
- `applyVendorPaystackTierUpgrade` lives alongside Stripe's `applyVendorTierUpgrade`; `applyVendorTierDowngrade` was generalized to clear both providers' fields so one shared downgrade path works for either.

## Frontend
- `upgrade-plan-card.tsx` fetches live plans + `enabledGateways` from `/vendors/:id/subscription/plans` (not hardcoded), shows a dual-currency price label, and only shows a gateway-choice dropdown when more than one gateway is enabled — skips straight to checkout otherwise.
- **Gotcha**: a `WriteFile` rewrite of a large component can silently fail to persist across a session — always re-read the full file immediately after a big rewrite (not just trust the tool's success response) before building on top of it, especially after any mid-session disconnect/restart event.

## Dev DB drift resurfaced mid-session
- Several previously-applied direct-DDL drift fixes (`job_run_status`, `platform_payment_credentials` columns, `site_content_audit_log`, vendors `announcement_email_opt_out`) were found missing again later in the same session after an environment disconnect — the dev DB state is not guaranteed durable across environment hiccups. Re-verify via logs/schema-guard output after any disconnect, don't assume earlier-session DDL fixes are still applied.
- `social_accounts.connected_via`/`access_token_encrypted`/`token_expires_at`, `post_publications`, and `posts.social_account_ids` remain missing in dev DB as of 2026-07-15 (unrelated to billing; social publishing feature) — startup `[schema-guard]` log lists exactly what's missing.
