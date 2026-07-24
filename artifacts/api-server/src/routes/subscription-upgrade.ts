/**
 * Self-service subscription upgrade & billing-management routes.
 *
 * POST /vendors/:id/subscription/checkout
 *   Creates a Stripe Checkout session (subscription mode) billed to the
 *   vendor using the platform Stripe key. Reuses (or creates) a Stripe
 *   Customer for the vendor so billing history/cancellation work later via
 *   the Customer Portal. On success the Stripe webhook marks the vendor's
 *   tier and stores the subscription id.
 *
 * GET  /vendors/:id/subscription/plans
 *   Returns the available plan definitions (for the UI to render without
 *   hard-coding prices).
 *
 * POST /vendors/:id/subscription/portal
 *   Creates a Stripe Customer Portal session so the vendor can view billing
 *   history, update their payment method, switch plans, or cancel. Requires
 *   the vendor to already have a stripeCustomerId (i.e. have checked out at
 *   least once).
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import type { Vendor } from "@workspace/db/schema";
import { resolveGatewayField, callWithPlatformStripe } from "../lib/platform-gateways";
import { ensureStripeCatalog, ensurePortalConfiguration } from "../lib/stripe-catalog";
import { ensurePaystackCatalog } from "../lib/paystack-catalog";
import { ensurePayPalCatalog, createPayPalSubscription, cancelPayPalSubscription } from "../lib/paypal-catalog";
import { reconcileVendorSubscription, applyVendorTierDowngrade } from "../lib/subscription-sync";
import { reconcileVendorPaystackSubscription } from "../lib/paystack-sync";
import { reconcileVendorPayPalSubscription } from "../lib/paypal-sync";
import { getSubscriptionPlans, getEnabledSubscriptionGateways, type SubscriptionGateway } from "../lib/subscription-plans";
import { getUsageSummary } from "../lib/usage";
import { getSiteContentBlock } from "../lib/site-content";

const router = Router();

// ─── Sync throttling ──────────────────────────────────────────────────────────
// The sync endpoint makes several live Stripe API calls (subscriptions.list,
// checkout.sessions.list, subscriptions.retrieve). A vendor mashing "Refresh
// billing status" or reloading the post-checkout success page repeatedly
// must not multiply those calls. We keep a tiny in-memory per-vendor state:
//  - `inFlight`: while a reconcile is running, concurrent requests just await
//    the same promise instead of starting a second one against Stripe.
//  - `lastRunAt` + COOLDOWN_MS: once a reconcile finishes, further requests
//    within the cooldown window get the cached last result instead of
//    re-hitting Stripe.
// This is per-process, in-memory state (acceptable here: it's a soft
// UX/cost guard, not a correctness guarantee — worst case on a restart or
// multi-instance deploy is one extra Stripe round-trip, not a serving bug).
const SYNC_COOLDOWN_MS = 20_000;

interface VendorSyncState {
  lastResult: import("../lib/subscription-sync").ReconcileResult;
  lastRunAt: number;
  inFlight: Promise<import("../lib/subscription-sync").ReconcileResult> | null;
}

const vendorSyncState = new Map<number, VendorSyncState>();

// ─── Checkout de-duplication ──────────────────────────────────────────────────
// A fast double-click on "Upgrade" (or a retried request before the redirect
// fires) must not create two Stripe Checkout Sessions for the same vendor.
// While a checkout-session creation is in flight for a vendor, concurrent
// requests just await and reuse that same in-flight result instead of
// calling Stripe again. Per-process, in-memory: worst case on a restart is
// one extra session, not a correctness bug (the vendor only ever completes
// one checkout flow at a time from their browser).
const checkoutInFlight = new Map<
  number,
  Promise<{ sessionId: string; url: string | null }>
>();

// ─── Plan definitions ─────────────────────────────────────────────────────────
// Plan pricing, features and resource quotas now live in the admin-editable
// "billing.subscriptionPlans" site-content block (see subscription-plans.ts)
// instead of being hardcoded here — admins manage them from the Site Editor,
// vendors only ever read them.

type PlanTier = "starter" | "pro" | "enterprise";
const VALID_UPGRADE_TIERS: PlanTier[] = ["starter", "pro", "enterprise"];

/** Reads the admin-editable trial settings from site-content. Handles both the legacy
 *  {durationDays} shape and the new {defaultDurationDays, availableDurations} shape. */
async function getTrialSettings(): Promise<{ enabled: boolean; defaultDurationDays: number; availableDurations: number[] }> {
  const block = (await getSiteContentBlock("billing.trialSettings")) as Record<string, unknown> | null;
  const defaultDurationDays =
    typeof block?.defaultDurationDays === "number" && block.defaultDurationDays >= 1
      ? block.defaultDurationDays
      : typeof block?.durationDays === "number" && block.durationDays >= 1
      ? block.durationDays
      : 7;
  const availableDurations =
    Array.isArray(block?.availableDurations) ? (block.availableDurations as number[]) : [7, 14, 21, 30];
  return {
    enabled: block?.enabled !== false,
    defaultDurationDays,
    availableDurations,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

function canManageVendor(userId: string, vendor: Vendor): boolean {
  return vendor.clerkUserId === userId || isAdmin(userId);
}

async function getVendorOr404(
  res: import("express").Response,
  id: number,
): Promise<Vendor | null> {
  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.id, id))
    .limit(1);
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return null;
  }
  return vendor;
}

// ─── GET /vendors/:id/subscription/plans ─────────────────────────────────────

router.get("/vendors/:id/subscription/plans", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await getVendorOr404(res, id);
  if (!vendor) return;

  if (!canManageVendor(userId, vendor)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [trialSettings, plans, enabledGateways] = await Promise.all([
    getTrialSettings(),
    getSubscriptionPlans(),
    getEnabledSubscriptionGateways(),
  ]);

  res.json({
    currentTier: vendor.subscriptionTier,
    trialEndsAt: vendor.trialEndsAt?.toISOString() ?? null,
    // trialAvailable: only true when the admin has trials enabled AND the vendor
    // has never subscribed or trialled before.
    trialAvailable:
      trialSettings.enabled &&
      vendor.subscriptionTier === "free" &&
      !vendor.stripeSubscriptionId &&
      !vendor.trialEndsAt,
    trialPeriodDays: trialSettings.defaultDurationDays,
    plans,
    enabledGateways,
  });
});

// ─── GET /vendors/:id/usage ───────────────────────────────────────────────────
// Metered resource usage vs. quota for the vendor's current billing period —
// shown on the vendor's own billing view and, since the same route is reachable
// by an admin via canManageVendor, in the admin's vendor-detail view too.

router.get("/vendors/:id/usage", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await getVendorOr404(res, id);
  if (!vendor) return;

  if (!canManageVendor(userId, vendor)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(await getUsageSummary(vendor));
});

// ─── POST /vendors/:id/subscription/checkout ─────────────────────────────────

router.post("/vendors/:id/subscription/checkout", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await getVendorOr404(res, id);
  if (!vendor) return;

  if (!canManageVendor(userId, vendor)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { tier, provider, successUrl, cancelUrl, withTrial } = req.body as {
    tier?: string;
    provider?: string;
    successUrl?: string;
    cancelUrl?: string;
    withTrial?: boolean;
  };

  if (!tier || !successUrl || !cancelUrl) {
    res.status(400).json({ error: "tier, successUrl and cancelUrl are required" });
    return;
  }

  if (!VALID_UPGRADE_TIERS.includes(tier as PlanTier)) {
    res.status(400).json({
      error: `tier must be one of: ${VALID_UPGRADE_TIERS.join(", ")}`,
    });
    return;
  }

  const gatewayProvider: SubscriptionGateway =
    provider === "paystack" ? "paystack" : provider === "paypal" ? "paypal" : "stripe";
  const enabledGateways = await getEnabledSubscriptionGateways();
  if (!enabledGateways[gatewayProvider]) {
    res.status(400).json({ error: `${gatewayProvider} is not currently enabled for subscription billing.` });
    return;
  }

  const plans = await getSubscriptionPlans();
  const plan = plans.find((p) => p.tier === tier)!;

  // Guard: don't allow downgrading via this route
  const TIER_RANK: Record<string, number> = {
    free: 0, starter: 1, pro: 2, enterprise: 3,
  };
  const currentRank = TIER_RANK[vendor.subscriptionTier ?? "free"] ?? 0;
  const targetRank = TIER_RANK[tier] ?? 0;
  if (targetRank <= currentRank) {
    res.status(409).json({
      error: `You are already on the ${vendor.subscriptionTier} plan or higher. Choose a higher tier to upgrade.`,
      currentTier: vendor.subscriptionTier,
    });
    return;
  }

  // Trial guard — validate trial eligibility before creating any checkout session.
  let trialDurationDays = 14;
  if (withTrial) {
    const trialSettings = await getTrialSettings();
    if (!trialSettings.enabled) {
      res.status(400).json({ error: "Free trials are not currently available." });
      return;
    }
    trialDurationDays = trialSettings.defaultDurationDays;
    if (gatewayProvider !== "stripe") {
      res.status(400).json({ error: "Free trials are only available via Stripe (card payment)." });
      return;
    }
    if (vendor.stripeSubscriptionId) {
      res.status(409).json({
        error: "You already have an active Stripe subscription. Free trials are only available for new subscribers.",
      });
      return;
    }
    if (vendor.trialEndsAt) {
      res.status(409).json({
        error: "You have already used your free trial. Subscribe directly to continue.",
      });
      return;
    }
  }

  // A checkout-session creation is already running for this vendor (e.g. a
  // double-click fired two requests before the first one's response — and
  // therefore the redirect — came back). Piggyback on that same in-flight
  // session instead of asking Stripe for a second one.
  const existingCheckout = checkoutInFlight.get(id);
  if (existingCheckout) {
    const result = await existingCheckout;
    res.json({ ...result, deduplicated: true });
    return;
  }

  const checkoutPromise: Promise<{ sessionId: string; url: string | null }> =
    gatewayProvider === "paystack"
      ? (async () => {
          const paystackKey = await resolveGatewayField("paystack", "secretKey");
          if (!paystackKey) {
            throw Object.assign(new Error("Paystack is not configured on this platform."), { statusCode: 503 });
          }
          if (!vendor.email) {
            throw Object.assign(new Error("Your account has no email on file — add one before subscribing."), { statusCode: 400 });
          }

          const catalog = await ensurePaystackCatalog(paystackKey, plans);
          const catalogEntry = catalog.find((c) => c.tier === tier);
          if (!catalogEntry) {
            throw Object.assign(new Error(`No Paystack plan configured for tier '${tier}'`), { statusCode: 500 });
          }

          const initResponse = await fetch("https://api.paystack.co/transaction/initialize", {
            method: "POST",
            headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              email: vendor.email,
              amount: catalogEntry.amount,
              currency: "NGN",
              plan: catalogEntry.planCode,
              callback_url: successUrl,
              metadata: {
                upgradeVendorId: id.toString(),
                upgradeTier: tier,
                upgradeClerkUserId: userId,
              },
            }),
          });
          const initData = (await initResponse.json()) as {
            status: boolean;
            message: string;
            data?: { authorization_url: string; reference: string };
          };
          if (!initData.status || !initData.data) {
            throw Object.assign(new Error(`Paystack checkout could not be started: ${initData.message}`), { statusCode: 502 });
          }

          return { sessionId: initData.data.reference, url: initData.data.authorization_url };
        })()
      : gatewayProvider === "paypal"
      ? (async () => {
          const paypalClientId = await resolveGatewayField("paypal", "clientId");
          const paypalClientSecret = await resolveGatewayField("paypal", "clientSecret");
          const paypalMode = (await resolveGatewayField("paypal", "mode")) ?? "live";
          if (!paypalClientId || !paypalClientSecret) {
            throw Object.assign(new Error("PayPal is not configured on this platform."), { statusCode: 503 });
          }

          const catalog = await ensurePayPalCatalog(paypalClientId, paypalClientSecret, paypalMode, plans);
          const catalogEntry = catalog.find((c) => c.tier === tier);
          if (!catalogEntry) {
            throw Object.assign(new Error(`No PayPal plan configured for tier '${tier}'`), { statusCode: 500 });
          }

          const { subscriptionId, approvalUrl } = await createPayPalSubscription(
            paypalClientId,
            paypalClientSecret,
            paypalMode,
            catalogEntry.planId,
            vendor.email,
            successUrl,
            cancelUrl,
            { upgradeVendorId: id.toString(), upgradeTier: tier, upgradeClerkUserId: userId },
          );

          // Persist the subscription ID immediately so the manual sync route
          // can recover the tier even if BILLING.SUBSCRIPTION.ACTIVATED never
          // arrives (e.g. missed webhook after the vendor approves in PayPal).
          // The subscription ID carries the custom_id metadata needed for upgrade.
          await db
            .update(vendorsTable)
            .set({ paypalSubscriptionId: subscriptionId, updatedAt: new Date() })
            .where(eq(vendorsTable.id, id));

          return { sessionId: subscriptionId, url: approvalUrl };
        })()
      : callWithPlatformStripe(async (stripe, stripeKey) => {
    // Reuse an existing Stripe Customer for this vendor so billing history and
    // the Customer Portal work across multiple checkouts. Create one lazily.
    let customerId = vendor.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: vendor.email ?? undefined,
        name: vendor.name,
        metadata: { vendorId: id.toString() },
      });
      customerId = customer.id;
      await db
        .update(vendorsTable)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(vendorsTable.id, id));
    }

    // Use a durable, catalog-managed Price rather than ad-hoc price_data so the
    // same Price object can later be offered inside the Customer Portal's
    // "switch plan" flow (Stripe requires real Prices there, not price_data).
    const catalog = await ensureStripeCatalog(stripe, stripeKey, plans);
    const catalogEntry = catalog.find((c) => c.tier === tier);
    if (!catalogEntry) {
      throw Object.assign(
        new Error(`No Stripe price configured for tier '${tier}'`),
        { statusCode: 500 },
      );
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: catalogEntry.priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        // These fields are read back in the Stripe webhook handler
        upgradeVendorId: id.toString(),
        upgradeTier: tier,
        upgradeClerkUserId: userId,
        ...(withTrial ? { withTrial: "true" } : {}),
      },
      subscription_data: {
        // When withTrial is true, Stripe captures the card but does not charge
        // it until the trial ends. The vendor gets full plan access immediately.
        ...(withTrial ? { trial_period_days: trialDurationDays } : {}),
        metadata: {
          upgradeVendorId: id.toString(),
          upgradeTier: tier,
        },
      },
    });

    return { sessionId: session.id, url: session.url };
  });

  checkoutInFlight.set(id, checkoutPromise);

  try {
    const result = await checkoutPromise;
    res.json({ ...result, deduplicated: false });
  } catch (err) {
    const statusCode =
      typeof err === "object" && err !== null && "statusCode" in err
        ? (err as { statusCode: number }).statusCode
        : undefined;
    if (statusCode) {
      res.status(statusCode).json({ error: (err as Error).message });
      return;
    }
    throw err;
  } finally {
    // Only clear the lock if we're still the current entry — a slow request
    // finishing after a newer one started (shouldn't happen given the map
    // key, but defensive) must not evict a fresher in-flight promise.
    if (checkoutInFlight.get(id) === checkoutPromise) {
      checkoutInFlight.delete(id);
    }
  }
});

// ─── POST /vendors/:id/subscription/portal ───────────────────────────────────
// Opens a Stripe Customer Portal session: billing history, payment method
// updates, plan switching, and cancellation all happen inside Stripe's UI.

router.post("/vendors/:id/subscription/portal", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await getVendorOr404(res, id);
  if (!vendor) return;

  if (!canManageVendor(userId, vendor)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (vendor.subscriptionProvider === "paystack") {
    res.status(409).json({
      error: "Your subscription is billed via Paystack, which doesn't have a self-service billing portal. Use the Cancel Subscription button instead — Paystack emails you receipts directly.",
    });
    return;
  }

  if (!vendor.stripeCustomerId) {
    res.status(409).json({
      error: "No billing account found yet. Upgrade to a paid plan first to set up billing.",
    });
    return;
  }

  const { returnUrl } = req.body as { returnUrl?: string };
  if (!returnUrl) {
    res.status(400).json({ error: "returnUrl is required" });
    return;
  }

  const plans = await getSubscriptionPlans();
  const { portalUrl } = await callWithPlatformStripe(async (stripe, stripeKey) => {
    const catalog = await ensureStripeCatalog(stripe, stripeKey, plans);
    const configurationId = await ensurePortalConfiguration(stripe, stripeKey, catalog);
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: vendor.stripeCustomerId ?? undefined,
      return_url: returnUrl,
      configuration: configurationId,
    });
    return { portalUrl: portalSession.url };
  });

  res.json({ url: portalUrl });
});

// ─── POST /vendors/:id/subscription/paystack/cancel ──────────────────────────
// Paystack has no self-service portal, so cancellation is a dedicated route:
// disables the subscription on Paystack's side, then downgrades immediately
// rather than waiting on the subscription.disable webhook (which also fires
// and is a safe no-op by the time it arrives — the vendor is already free).

router.post("/vendors/:id/subscription/paystack/cancel", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await getVendorOr404(res, id);
  if (!vendor) return;

  if (!canManageVendor(userId, vendor)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (vendor.subscriptionProvider !== "paystack" || !vendor.paystackSubscriptionCode || !vendor.paystackEmailToken) {
    res.status(409).json({ error: "No active Paystack subscription found to cancel." });
    return;
  }

  const paystackKey = await resolveGatewayField("paystack", "secretKey");
  if (!paystackKey) {
    res.status(503).json({ error: "Paystack is not configured on this platform." });
    return;
  }

  const disableResponse = await fetch("https://api.paystack.co/subscription/disable", {
    method: "POST",
    headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code: vendor.paystackSubscriptionCode, token: vendor.paystackEmailToken }),
  });
  const disableData = (await disableResponse.json()) as { status: boolean; message: string };
  if (!disableData.status) {
    res.status(502).json({ error: `Paystack could not cancel the subscription: ${disableData.message}` });
    return;
  }

  await applyVendorTierDowngrade(vendor, "vendor-cancel");
  res.json({ cancelled: true, currentTier: "free" });
});

// ─── POST /vendors/:id/subscription/paypal/cancel ────────────────────────────
// PayPal has no self-service portal; vendors cancel via this dedicated route.
// Calls the PayPal API to cancel the subscription, then immediately downgrades
// the vendor to free (same pattern as Paystack cancel).

router.post("/vendors/:id/subscription/paypal/cancel", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await getVendorOr404(res, id);
  if (!vendor) return;

  if (!canManageVendor(userId, vendor)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (vendor.subscriptionProvider !== "paypal" || !vendor.paypalSubscriptionId) {
    res.status(409).json({ error: "No active PayPal subscription found to cancel." });
    return;
  }

  const paypalClientId = await resolveGatewayField("paypal", "clientId");
  const paypalClientSecret = await resolveGatewayField("paypal", "clientSecret");
  const paypalMode = (await resolveGatewayField("paypal", "mode")) ?? "live";

  if (!paypalClientId || !paypalClientSecret) {
    res.status(503).json({ error: "PayPal is not configured on this platform." });
    return;
  }

  await cancelPayPalSubscription(
    paypalClientId,
    paypalClientSecret,
    paypalMode,
    vendor.paypalSubscriptionId,
    "Vendor requested cancellation via dashboard",
  );

  await applyVendorTierDowngrade(vendor, "vendor-cancel");
  res.json({ cancelled: true, currentTier: "free" });
});

// ─── POST /vendors/:id/subscription/sync ─────────────────────────────────────
// Reconciles the vendor's tier directly against Stripe, in both directions.
// Covers the case where checkout.session.completed was never delivered —
// dropped entirely, or all of Stripe's retry attempts were exhausted before
// the server came back up — as well as the mirror case where
// customer.subscription.deleted / charge.refunded was missed and the vendor
// is still sitting on a stale paid tier after their subscription actually
// lapsed or was cancelled. Vendors can trigger this themselves ("Refresh
// billing status") and it can also be polled after returning from Stripe
// Checkout.

router.post("/vendors/:id/subscription/sync", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await getVendorOr404(res, id);
  if (!vendor) return;

  if (!canManageVendor(userId, vendor)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const isPaystackVendor = vendor.subscriptionProvider === "paystack" && !!vendor.paystackSubscriptionCode;
  // PayPal sync uses two signals, with explicit provider taking priority:
  //  1. subscriptionProvider === "paypal" → webhook already fired; vendor is fully on PayPal.
  //  2. subscriptionProvider is null AND paypalSubscriptionId is set → vendor approved the
  //     PayPal flow but BILLING.SUBSCRIPTION.ACTIVATED webhook hasn't arrived yet (the
  //     missed-webhook recovery window). We intentionally do NOT exclude vendors who also
  //     have stripeCustomerId — that field is never cleared after a Stripe downgrade, so
  //     former Stripe subscribers who then start a PayPal checkout legitimately have both.
  //     Provider precedence is enforced by subscriptionProvider being null (not "stripe"),
  //     and reconcileVendorPayPalSubscription refuses to downgrade if subscriptionProvider
  //     is explicitly set to another provider.
  const isPayPalVendor =
    vendor.subscriptionProvider === "paypal" ||
    (!vendor.subscriptionProvider && !!vendor.paypalSubscriptionId);
  if (!vendor.stripeCustomerId && !isPaystackVendor && !isPayPalVendor) {
    res.json({ synced: false, reason: "No billing account on file yet — nothing to sync.", currentTier: vendor.subscriptionTier });
    return;
  }

  const now = Date.now();
  const existing = vendorSyncState.get(id);

  // A reconcile is already running for this vendor — piggyback on it instead
  // of starting a second concurrent round-trip to Stripe.
  if (existing?.inFlight) {
    const result = await existing.inFlight;
    res.json({ ...result, throttled: true, cooldownMs: SYNC_COOLDOWN_MS });
    return;
  }

  // A reconcile just finished — serve the cached result rather than hitting
  // Stripe again until the cooldown window elapses.
  if (existing && now - existing.lastRunAt < SYNC_COOLDOWN_MS) {
    const retryAfterMs = SYNC_COOLDOWN_MS - (now - existing.lastRunAt);
    res.json({ ...existing.lastResult, throttled: true, cooldownMs: SYNC_COOLDOWN_MS, retryAfterMs });
    return;
  }

  let syncPromise: Promise<import("../lib/subscription-sync").ReconcileResult>;
  if (isPaystackVendor) {
    const paystackKey = await resolveGatewayField("paystack", "secretKey");
    if (!paystackKey) {
      res.status(503).json({ error: "Paystack is not configured on this platform." });
      return;
    }
    syncPromise = reconcileVendorPaystackSubscription(vendor, paystackKey, "manual-sync");
  } else if (isPayPalVendor) {
    const [paypalClientId, paypalClientSecret] = await Promise.all([
      resolveGatewayField("paypal", "clientId"),
      resolveGatewayField("paypal", "clientSecret"),
    ]);
    const paypalMode = (await resolveGatewayField("paypal", "mode")) ?? "live";
    if (!paypalClientId || !paypalClientSecret) {
      res.status(503).json({ error: "PayPal is not configured on this platform." });
      return;
    }
    syncPromise = reconcileVendorPayPalSubscription(vendor, paypalClientId, paypalClientSecret, paypalMode, "manual-sync");
  } else {
    syncPromise = callWithPlatformStripe((stripe) => reconcileVendorSubscription(vendor, stripe, "manual-sync"));
  }

  const fallbackResult = existing?.lastResult ?? { synced: false, currentTier: vendor.subscriptionTier };
  vendorSyncState.set(id, { lastResult: fallbackResult, lastRunAt: now, inFlight: syncPromise });

  try {
    const result = await syncPromise;
    vendorSyncState.set(id, { lastResult: result, lastRunAt: Date.now(), inFlight: null });
    res.json({ ...result, throttled: false, cooldownMs: SYNC_COOLDOWN_MS });
  } catch (err) {
    // Don't leave a stuck in-flight lock behind on failure — let the vendor
    // retry immediately rather than being stuck in a false cooldown.
    vendorSyncState.set(id, { lastResult: fallbackResult, lastRunAt: 0, inFlight: null });
    throw err;
  }
});

export default router;
