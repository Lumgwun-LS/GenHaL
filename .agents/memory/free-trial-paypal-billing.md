---
name: Free trial + PayPal subscription billing
description: Trial is Stripe-only; PayPal is subscription-only billing (not order payments); trialEndsAt managed via webhook.
---

## Rules

- **Trial only via Stripe**: `withTrial: true` is rejected for paypal/paystack providers. Checkout adds `trial_period_days: TRIAL_PERIOD_DAYS` (14) to Stripe `subscription_data`. Guard checks that `vendor.stripeSubscriptionId` is null before allowing.
- **trialEndsAt managed via webhook**: Set in `customer.subscription.updated` when status === "trialing" and trial_end is set; cleared to null when status !== "trialing". Never set directly at checkout.
- **trial_will_end handler**: Fires 3 days before trial ends (configurable in Stripe dashboard). Sends in-app (vendorNotificationsTable) + email. Uses existing wrapVendorEmail/escapeHtml/sendEmail.
- **Plans endpoint returns trial metadata**: `trialEndsAt`, `trialAvailable` (free tier + no stripeSubscriptionId + no trialEndsAt), `trialPeriodDays`.
- **PayPal is subscription-only**: In GATEWAY_PROVIDERS (admin credential panel) but NOT in GATEWAY_ENABLED_FIELD (no per-vendor order-payment toggle, no vendor.paypalEnabled column). GATEWAY_ENABLED_FIELD is now `Partial<Record<...>>` to handle this.
- **PayPal catalog**: Stored in platform_payment_credentials encrypted JSON (productId + per-tier planIds). Lazily created/updated by `ensurePayPalCatalog` on first checkout per tier.
- **PayPal webhook**: `processPayPalEvent` handles BILLING.SUBSCRIPTION.ACTIVATED (upgrade + set paypalSubscriptionId + subscriptionProvider="paypal") and CANCELLED/EXPIRED/SUSPENDED (downgrade via same applyVendorTierDowngrade pattern as Stripe).
- **PayPal cancel route**: POST /vendors/:id/subscription/paypal/cancel. Checks subscriptionProvider === "paypal" && paypalSubscriptionId before calling cancelPayPalSubscription then applyVendorTierDowngrade.
- **DB columns**: `vendors.trial_ends_at` (timestamptz) and `vendors.paypal_subscription_id` (text) — both nullable.
- **Frontend**: TrialBanner shown when trialEndsAt is set; shows days-left + warning at ≤3 days + "Manage card" Stripe portal link. ManageBillingButton handles PayPal cancel as a direct cancel (no portal). "Start N-day free trial" dashed button appears on each plan card when trialAvailable === true, always uses Stripe.
- **public-post-links.ts type fix**: getPaymentMethodAvailability now returns GatewayProvider (includes "paypal") but PostLinkProvider doesn't; cast with `as PostLinkProvider` after filtering is safe since enabledProviders only returns PostLinkProvider values.

**Why:**
- PayPal has no native trial mechanism, so Stripe-only trials makes sense.
- trialEndsAt via subscription.updated webhook (not checkout.session.completed) because the session completed event doesn't include trial_end directly; subscription.updated always fires after session completion with the full subscription object.
- PayPal not in GATEWAY_ENABLED_FIELD because order-payment gateways (per-vendor toggle) and subscription billing (platform-level) are separate concerns — conflating them broke the type for vendor credentials.
