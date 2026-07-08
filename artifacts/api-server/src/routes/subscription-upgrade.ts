/**
 * Self-service subscription upgrade routes.
 *
 * POST /vendors/:id/subscription/checkout
 *   Creates a Stripe Checkout session billed to the vendor using the platform
 *   Stripe key.  On success the Stripe webhook marks the vendor's tier.
 *
 * GET  /vendors/:id/subscription/plans
 *   Returns the available plan definitions (for the UI to render without
 *   hard-coding prices).
 */

import { Router } from "express";
import Stripe from "stripe";
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import type { Vendor } from "@workspace/db/schema";

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

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    res.status(503).json({ error: "Stripe is not configured on this platform." });
    return;
  }

  const stripe = new Stripe(stripeKey);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: vendor.email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: plan.currency,
          unit_amount: plan.price * 100,
          product_data: {
            name: `VendorHub ${plan.name} Plan`,
            description: plan.description,
          },
        },
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      // These fields are read back in the Stripe webhook handler
      upgradeVendorId: id.toString(),
      upgradeTier: tier,
      upgradeClerkUserId: userId,
    },
  });

  res.json({ sessionId: session.id, url: session.url });
});

export default router;
