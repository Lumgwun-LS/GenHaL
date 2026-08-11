/**
 * GenHaL — Subscription plans for Kingdoms and Families
 * Checkout via Stripe (USD) or Paystack (NGN)
 */
import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { genhalSubscriptionsTable, genhalKingdomMembersTable, genhalFamilyMembersTable, GENHAL_PLANS } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import Stripe from "stripe";

const router = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
}

const STRIPE_PRICE_IDS: Record<string, string> = {
  // These should be set as environment variables once Stripe products are created
  "starter:usd": process.env.GENHAL_STRIPE_STARTER_USD ?? "",
  "pro:usd":     process.env.GENHAL_STRIPE_PRO_USD ?? "",
  "royal:usd":   process.env.GENHAL_STRIPE_ROYAL_USD ?? "",
};

// ── Get plans (public) ────────────────────────────────────────────────────────
router.get("/genhal/plans", async (req, res): Promise<void> => {
  const { unitType } = req.query;
  const plans = Object.values(GENHAL_PLANS).filter(p => {
    if (unitType === "family" && (p as any).kingdomOnly) return false;
    return true;
  });
  res.json(plans);
});

// ── Get current subscription ──────────────────────────────────────────────────
router.get("/genhal/subscriptions/:unitType/:unitId", requireAuth(), async (req, res): Promise<void> => {
  try {
    const { unitType, unitId } = req.params;
    const [sub] = await db.select().from(genhalSubscriptionsTable)
      .where(and(eq(genhalSubscriptionsTable.unitType, unitType as string), eq(genhalSubscriptionsTable.unitId, Number(unitId))));
    if (!sub) {
      // Return a synthetic free plan if no subscription row yet
      return void res.json({ plan: "free", status: "active", ...GENHAL_PLANS.free });
    }
    res.json(sub);
  } catch { res.status(500).json({ error: "Failed" }); }
});

// ── Ensure a free subscription exists (called on kingdom/family creation) ─────
router.post("/genhal/subscriptions/ensure-free", requireAuth(), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const { unitType, unitId } = req.body;
  if (!unitType || !unitId) return void res.status(400).json({ error: "unitType and unitId required" });
  try {
    const [existing] = await db.select().from(genhalSubscriptionsTable)
      .where(and(eq(genhalSubscriptionsTable.unitType, unitType as string), eq(genhalSubscriptionsTable.unitId, Number(unitId))));
    if (existing) return void res.json(existing);
    const [sub] = await db.insert(genhalSubscriptionsTable).values({
      unitType, unitId: Number(unitId), plan: "free", status: "active",
      storageLimitBytes: GENHAL_PLANS.free.storageLimitBytes,
      maxMembers: GENHAL_PLANS.free.maxMembers,
      maxVaultDocuments: GENHAL_PLANS.free.maxVaultDocuments,
      createdByClerkUserId: userId,
    }).returning();
    res.status(201).json(sub);
  } catch { res.status(500).json({ error: "Failed" }); }
});

// ── Stripe checkout ───────────────────────────────────────────────────────────
router.post("/genhal/subscriptions/checkout/stripe", requireAuth(), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const { unitType, unitId, plan, successUrl, cancelUrl } = req.body;
  if (!unitType || !unitId || !plan) return void res.status(400).json({ error: "unitType, unitId, plan required" });

  const planDef = GENHAL_PLANS[plan as keyof typeof GENHAL_PLANS];
  if (!planDef || plan === "free") return void res.status(400).json({ error: "Invalid plan" });

  const stripePriceId = STRIPE_PRICE_IDS[`${plan}:usd`];
  if (!stripePriceId) {
    // Stripe products not yet configured — return the plan info for manual payment
    return void res.json({
      manual: true,
      plan: planDef,
      message: "Stripe products not yet configured. Contact the administrator to upgrade manually.",
    });
  }

  try {
    const stripe = getStripe();
    const [existing] = await db.select().from(genhalSubscriptionsTable)
      .where(and(eq(genhalSubscriptionsTable.unitType, unitType as string), eq(genhalSubscriptionsTable.unitId, Number(unitId))));

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: stripePriceId, quantity: 1 }],
      customer: existing?.stripeCustomerId ?? undefined,
      success_url: successUrl ?? `${process.env.GENHAL_APP_URL ?? ""}/kingdoms/${unitId}?upgraded=true`,
      cancel_url: cancelUrl ?? `${process.env.GENHAL_APP_URL ?? ""}/kingdoms/${unitId}`,
      metadata: { unitType, unitId: String(unitId), plan, clerkUserId: userId },
    });
    res.json({ checkoutUrl: session.url });
  } catch (err) { logger.error(err); res.status(500).json({ error: "Stripe checkout failed" }); }
});

// ── Paystack checkout ─────────────────────────────────────────────────────────
router.post("/genhal/subscriptions/checkout/paystack", requireAuth(), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const { unitType, unitId, plan, email } = req.body;
  if (!unitType || !unitId || !plan || !email) return void res.status(400).json({ error: "unitType, unitId, plan, email required" });

  const planDef = GENHAL_PLANS[plan as keyof typeof GENHAL_PLANS];
  if (!planDef || plan === "free") return void res.status(400).json({ error: "Invalid plan" });

  const amount = (planDef as any).priceNgn * 100; // kobo
  const paystackKey = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackKey) return void res.status(503).json({ error: "Paystack not configured" });

  try {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email, amount, currency: "NGN",
        metadata: { unitType, unitId: String(unitId), plan, clerkUserId: userId, genhalSubscription: true },
        callback_url: `${process.env.GENHAL_APP_URL ?? ""}/kingdoms/${unitId}?upgraded=true`,
      }),
    }).then(r => r.json()) as { status: boolean; message?: string; data?: { authorization_url: string; reference: string } };

    if (!response.status) throw new Error(response.message ?? "Paystack init failed");
    res.json({ checkoutUrl: response.data?.authorization_url, reference: response.data?.reference });
  } catch (err) { logger.error(err); res.status(500).json({ error: "Paystack checkout failed" }); }
});

// ── Admin manual upgrade (for testing / comps) ───────────────────────────────
router.post("/genhal/subscriptions/admin-upgrade", requireAuth(), async (req, res): Promise<void> => {
  const { unitType, unitId, plan } = req.body;
  const planDef = GENHAL_PLANS[plan as keyof typeof GENHAL_PLANS];
  if (!planDef) return void res.status(400).json({ error: "Invalid plan" });
  try {
    const userId = getAuth(req).userId!;
    const [existing] = await db.select().from(genhalSubscriptionsTable)
      .where(and(eq(genhalSubscriptionsTable.unitType, unitType as string), eq(genhalSubscriptionsTable.unitId, Number(unitId))));

    const now = new Date();
    const periodEnd = new Date(now); periodEnd.setMonth(periodEnd.getMonth() + 1);

    if (existing) {
      const [updated] = await db.update(genhalSubscriptionsTable).set({
        plan, status: "active",
        storageLimitBytes: planDef.storageLimitBytes,
        maxMembers: planDef.maxMembers,
        maxVaultDocuments: planDef.maxVaultDocuments,
        currentPeriodStart: now, currentPeriodEnd: periodEnd,
        updatedAt: now,
      }).where(eq(genhalSubscriptionsTable.id, existing.id)).returning();
      return void res.json(updated);
    }

    const [created] = await db.insert(genhalSubscriptionsTable).values({
      unitType, unitId: Number(unitId), plan, status: "active",
      storageLimitBytes: planDef.storageLimitBytes,
      maxMembers: planDef.maxMembers,
      maxVaultDocuments: planDef.maxVaultDocuments,
      currentPeriodStart: now, currentPeriodEnd: periodEnd,
      createdByClerkUserId: userId,
    }).returning();
    res.status(201).json(created);
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed" }); }
});

export default router;
