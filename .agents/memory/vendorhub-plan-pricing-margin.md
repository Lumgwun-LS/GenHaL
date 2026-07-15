---
name: VendorHub admin-editable subscription plans with 5x margin sizing
description: How Starter/Pro/Enterprise plan pricing/quotas are stored and why the quota numbers were chosen this way.
---

Plan price, description, features, and bundled monthly resource quotas (AI
images/videos/captions, voice minutes, SMS, email) live in the
`billing.subscriptionPlans` site-content block (site-content.ts), not a
hardcoded constant. Admins edit them from the "Plans" tab in the admin panel
(reuses the generic `PATCH /admin/site-content/:key` route — same mechanism
as the Site Editor, gets audit history for free). Vendors only ever read
plans (checkout, portal, `/vendors/:id/subscription/plans`), never write
them. `getSubscriptionPlans()`/`getSubscriptionPlan(tier)` in
`lib/subscription-plans.ts` are the read API; anything that used to import
the old `SUBSCRIPTION_PLANS` constant from `subscription-upgrade.ts` must
call these async functions instead.

**Why:** the user wanted plan pricing/quotas to guarantee ~5x gross margin
over the resources bundled into each tier, and wanted only admins (not
vendors) able to change plans. Reusing site-content instead of a new table
avoided a new migration and got admin audit history for free.

**Sizing methodology:** quotas are picked so `price / 5 >= resourceCost +
gatewayFee(~3%) + flatOverhead`, using assumed unit costs (OpenAI image
~$0.19, AI video ~$0.30, AI caption ~$0.01, voice minute ~$0.06, SMS ~$0.01,
email ~$0.001 — see `PLAN_RESOURCE_UNIT_COSTS` in subscription-plans.ts).
These are estimates, not invoiced costs — re-derive if real costs differ.
Quota enforcement/metering is NOT implemented — this is pricing/definition
only; nothing currently blocks a vendor from generating more than their
quota.

**Stripe catalog implication:** since prices can now change live via the
admin panel, and Stripe Prices are immutable, `ensureStripeCatalog` in
stripe-catalog.ts now takes the live `plans` array as a parameter, diffs the
found Price's `unit_amount` against the current admin-configured price, and
mints a replacement Price (retiring the old one) when they differ. The
catalog cache is now short-TTL (30s), not permanent-for-process-lifetime, so
an admin's price edit reaches checkout/portal within seconds.
