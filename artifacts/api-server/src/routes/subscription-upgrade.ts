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
import Stripe from "stripe";
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import type { Vendor } from "@workspace/db/schema";
import { resolveGatewayField } from "../lib/platform-gateways";
import { ensureStripeCatalog, ensurePortalConfiguration } from "../lib/stripe-catalog";
import { applyVendorTierUpgrade } from "../lib/subscription-sync";

const router = Router();

// ─── Plan definitions ─────────────────────────────────────────────────────────

export const SUBSCRIPTION_PLANS = [
  {
    tier: "starter",
    name: "Starter",
    price: 29,
    currency: "usd",
    description: "Get started with direct payment routing",
    features: [
      "Connect your own Stripe or Paystack account",
      "Up to 100 orders / month",
      "Email support",
      "Basic analytics",
    ],
    highlight: false,
  },
  {
    tier: "pro",
    name: "Pro",
    price: 79,
    currency: "usd",
    description: "Everything your growing business needs",
    features: [
      "Everything in Starter",
      "Unlimited orders",
      "Priority support",
      "Advanced analytics",
      "Multi-currency payouts",
    ],
    highlight: true,
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    price: 199,
    currency: "usd",
    description: "For high-volume vendors and large teams",
    features: [
      "Everything in Pro",
      "Dedicated account manager",
      "Custom integrations",
      "SLA guarantees",
      "White-glove onboarding",
    ],
    highlight: false,
  },
] as const;

type PlanTier = (typeof SUBSCRIPTION_PLANS)[number]["tier"];
const VALID_UPGRADE_TIERS: PlanTier[] = ["starter", "pro", "enterprise"];

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

  res.json({
    currentTier: vendor.subscriptionTier,
    plans: SUBSCRIPTION_PLANS,
  });
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

  const { tier, successUrl, cancelUrl } = req.body as {
    tier?: string;
    successUrl?: string;
    cancelUrl?: string;
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

  const plan = SUBSCRIPTION_PLANS.find((p) => p.tier === tier)!;

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

  const stripeKey = await resolveGatewayField("stripe", "secretKey");
  if (!stripeKey) {
    res.status(503).json({ error: "Stripe is not configured on this platform." });
    return;
  }

  const stripe = new Stripe(stripeKey);

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
  const catalog = await ensureStripeCatalog(stripe, stripeKey);
  const catalogEntry = catalog.find((c) => c.tier === tier);
  if (!catalogEntry) {
    res.status(500).json({ error: `No Stripe price configured for tier '${tier}'` });
    return;
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
    },
    subscription_data: {
      metadata: {
        upgradeVendorId: id.toString(),
        upgradeTier: tier,
      },
    },
  });

  res.json({ sessionId: session.id, url: session.url });
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

  const stripeKey = await resolveGatewayField("stripe", "secretKey");
  if (!stripeKey) {
    res.status(503).json({ error: "Stripe is not configured on this platform." });
    return;
  }

  const stripe = new Stripe(stripeKey);

  // Ensure the portal is configured to allow switching between our tier
  // Prices (not just cancel/payment-method/invoices).
  const catalog = await ensureStripeCatalog(stripe, stripeKey);
  const configurationId = await ensurePortalConfiguration(stripe, stripeKey, catalog);

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: vendor.stripeCustomerId,
    return_url: returnUrl,
    configuration: configurationId,
  });

  res.json({ url: portalSession.url });
});

// ─── POST /vendors/:id/subscription/sync ─────────────────────────────────────
// Reconciles the vendor's tier directly against Stripe. Covers the case
// where checkout.session.completed was never delivered — dropped entirely,
// or all of Stripe's retry attempts were exhausted before the server came
// back up. Vendors can trigger this themselves ("Refresh billing status")
// and it can also be polled after returning from Stripe Checkout.

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

  if (!vendor.stripeCustomerId) {
    res.json({ synced: false, reason: "No Stripe customer on file yet — nothing to sync.", currentTier: vendor.subscriptionTier });
    return;
  }

  const stripeKey = await resolveGatewayField("stripe", "secretKey");
  if (!stripeKey) {
    res.status(503).json({ error: "Stripe is not configured on this platform." });
    return;
  }

  const stripe = new Stripe(stripeKey);
  const TIER_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };

  // 1) Look at the vendor's active/trialing subscriptions directly — this is
  //    authoritative and catches the case where the webhook never fired at
  //    all (checkout completed, subscription exists, DB was never told).
  const subscriptions = await stripe.subscriptions.list({
    customer: vendor.stripeCustomerId,
    status: "all",
    limit: 10,
  });

  let bestTier: string | null = null;
  let bestSubscriptionId: string | null = null;

  for (const sub of subscriptions.data) {
    if (sub.status !== "active" && sub.status !== "trialing") continue;
    const tier = sub.metadata?.upgradeTier ?? sub.items.data[0]?.price?.metadata?.tier ?? null;
    if (!tier || !VALID_UPGRADE_TIERS.includes(tier as PlanTier)) continue;
    if (!bestTier || (TIER_RANK[tier] ?? 0) > (TIER_RANK[bestTier] ?? 0)) {
      bestTier = tier;
      bestSubscriptionId = sub.id;
    }
  }

  // 2) Fall back to recent Checkout Sessions in case the subscription lookup
  //    above misses (e.g. session paid but subscription object metadata
  //    lagged) — covers a dropped webhook mid-flight. A paid session is only
  //    used to *locate* a subscription id; entitlement is decided by
  //    re-fetching that subscription and confirming it's still active or
  //    trialing right now. A historical paid session for a since-canceled
  //    subscription must never grant a tier.
  if (!bestTier) {
    const sessions = await stripe.checkout.sessions.list({
      customer: vendor.stripeCustomerId,
      limit: 10,
    });
    for (const session of sessions.data) {
      if (session.payment_status !== "paid" || session.status !== "complete") continue;
      const tier = session.metadata?.upgradeTier ?? null;
      const sessionVendorId = session.metadata?.upgradeVendorId ? parseInt(session.metadata.upgradeVendorId) : null;
      if (sessionVendorId !== id || !tier || !VALID_UPGRADE_TIERS.includes(tier as PlanTier)) continue;

      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);
      if (!subscriptionId) continue; // no subscription tied to this session — nothing to verify

      // Re-fetch live status; do not trust the session snapshot alone.
      const liveSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (liveSubscription.status !== "active" && liveSubscription.status !== "trialing") continue;

      if (!bestTier || (TIER_RANK[tier] ?? 0) > (TIER_RANK[bestTier] ?? 0)) {
        bestTier = tier;
        bestSubscriptionId = subscriptionId;
      }
    }
  }

  if (!bestTier) {
    res.json({
      synced: false,
      reason: "No paid subscription found on Stripe for this vendor.",
      currentTier: vendor.subscriptionTier,
    });
    return;
  }

  const result = await applyVendorTierUpgrade(id, bestTier, bestSubscriptionId, "manual-sync");

  res.json({
    synced: result.applied,
    reason: result.reason,
    currentTier: result.applied ? bestTier : vendor.subscriptionTier,
  });
});

export default router;
