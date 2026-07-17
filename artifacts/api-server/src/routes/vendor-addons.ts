/**
 * Add-on resource capacity purchase routes.
 *
 * Vendors can proactively buy extra capacity for any of the six metered
 * resources (AI images, AI videos, AI captions, voice minutes, SMS, email)
 * without changing their base plan tier. Charges go through their existing
 * subscription gateway (Stripe or Paystack). PayPal is out of scope until
 * PayPal subscription billing is fully set up.
 *
 * POST /vendors/:id/addons/checkout
 *   Creates a one-time payment checkout for a bundle of extra units of a
 *   resource. Records a pending `vendor_addon_credits` row that is activated
 *   by the Stripe/Paystack webhook on payment success.
 *
 * GET  /vendors/:id/addons
 *   Returns all active and pending add-on credit rows for a vendor, useful
 *   for the vendor's usage view and admin detail view.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { vendorsTable, vendorAddonCreditsTable } from "@workspace/db/schema";
import { eq, desc, and, or } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import type { Vendor } from "@workspace/db/schema";
import { resolveGatewayField, callWithPlatformStripe } from "../lib/platform-gateways";
import { getOverageRates, RESOURCE_KEYS, RESOURCE_LABEL, type ResourceKey } from "../lib/usage";

const router = Router();

// Standard addon bundle sizes (units) offered as quick-picks in the UI.
// Vendors can request any positive integer quantity, but these are the
// suggested sizes shown in the UI.
export const ADDON_BUNDLE_SIZES: Record<ResourceKey, number[]> = {
  aiImages:     [5, 10, 25, 50],
  aiVideos:     [2, 5, 10, 20],
  aiCaptions:   [25, 50, 100, 250],
  voiceMinutes: [10, 30, 60, 120],
  sms:          [50, 100, 250, 500],
  email:        [100, 250, 500, 1000],
};

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
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return null;
  }
  return vendor;
}

// ─── POST /vendors/:id/addons/checkout ───────────────────────────────────────

router.post("/vendors/:id/addons/checkout", async (req, res): Promise<void> => {
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

  const { resource, quantity, successUrl, cancelUrl } = req.body as {
    resource?: string;
    quantity?: number;
    successUrl?: string;
    cancelUrl?: string;
  };

  if (!resource || !RESOURCE_KEYS.includes(resource as ResourceKey)) {
    res.status(400).json({ error: `resource must be one of: ${RESOURCE_KEYS.join(", ")}` });
    return;
  }
  if (!quantity || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
    res.status(400).json({ error: "quantity must be a positive integer (max 100,000)" });
    return;
  }
  if (!successUrl || !cancelUrl) {
    res.status(400).json({ error: "successUrl and cancelUrl are required" });
    return;
  }

  const resourceKey = resource as ResourceKey;
  const rates = await getOverageRates();
  const unitRate = rates[resourceKey];
  const totalUsd = quantity * unitRate;

  // Determine which gateway to use: prefer their subscription gateway, fall back to Stripe
  const gateway: "stripe" | "paystack" =
    vendor.subscriptionProvider === "paystack" ? "paystack" : "stripe";

  if (gateway === "paystack") {
    const paystackKey = await resolveGatewayField("paystack", "secretKey");
    if (!paystackKey) {
      res.status(503).json({ error: "Paystack is not configured on this platform." });
      return;
    }
    if (!vendor.email) {
      res.status(400).json({ error: "Your account has no email on file — add one before purchasing add-ons." });
      return;
    }

    // Create pending addon credit row first so we have the ID for metadata
    const [addonCredit] = await db.insert(vendorAddonCreditsTable).values({
      vendorId: id,
      resource: resourceKey,
      unitsGranted: quantity.toString(),
      unitsRemaining: "0", // set to granted amount on payment success
      unitRateUsd: unitRate.toString(),
      totalPaidUsd: totalUsd.toString(),
      gateway: "paystack",
      status: "pending",
    }).returning({ id: vendorAddonCreditsTable.id });

    // Paystack amount is in kobo (NGN × 100), but we compute a NGN equivalent
    // based on the same ~1550 rate used for subscription billing.
    const USD_TO_NGN = 1550;
    const amountNgn = Math.round(totalUsd * USD_TO_NGN * 100); // kobo

    const initResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: vendor.email,
        amount: amountNgn,
        currency: "NGN",
        callback_url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}addonCreditId=${addonCredit.id}`,
        metadata: {
          addonCreditId: addonCredit.id.toString(),
          addonVendorId: id.toString(),
          addonResource: resourceKey,
          addonQuantity: quantity.toString(),
        },
      }),
    });
    const initData = (await initResponse.json()) as {
      status: boolean;
      message: string;
      data?: { authorization_url: string; reference: string };
    };
    if (!initData.status || !initData.data) {
      // Clean up pending row
      await db.delete(vendorAddonCreditsTable).where(eq(vendorAddonCreditsTable.id, addonCredit.id));
      res.status(502).json({ error: `Paystack checkout could not be started: ${initData.message}` });
      return;
    }

    // Store the Paystack reference so we can match it in the webhook
    await db.update(vendorAddonCreditsTable)
      .set({ gatewayPaymentId: initData.data.reference, updatedAt: new Date() })
      .where(eq(vendorAddonCreditsTable.id, addonCredit.id));

    res.json({ url: initData.data.authorization_url, addonCreditId: addonCredit.id });
    return;
  }

  // Stripe one-time payment checkout
  const hasStripeKey = !!(await resolveGatewayField("stripe", "secretKey") || await resolveGatewayField("stripe", "fallbackSecretKey"));
  if (!hasStripeKey) {
    res.status(503).json({ error: "Stripe is not configured on this platform." });
    return;
  }

  // Create pending addon credit row first so we have the ID for metadata
  const [addonCredit] = await db.insert(vendorAddonCreditsTable).values({
    vendorId: id,
    resource: resourceKey,
    unitsGranted: quantity.toString(),
    unitsRemaining: "0", // set to granted amount on payment success
    unitRateUsd: unitRate.toString(),
    totalPaidUsd: totalUsd.toString(),
    gateway: "stripe",
    status: "pending",
  }).returning({ id: vendorAddonCreditsTable.id });

  try {
    const result = await callWithPlatformStripe(async (stripe) => {
      // Reuse existing Stripe customer or create one
      let customerId = vendor.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: vendor.email ?? undefined,
          name: vendor.name,
          metadata: { vendorId: id.toString() },
        });
        customerId = customer.id;
        await db.update(vendorsTable)
          .set({ stripeCustomerId: customerId, updatedAt: new Date() })
          .where(eq(vendorsTable.id, id));
      }

      const amountCents = Math.round(totalUsd * 100);
      const label = RESOURCE_LABEL[resourceKey];

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        customer: customerId,
        line_items: [{
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: `Add-on: ${quantity} extra ${label}`,
              description: `${quantity} additional ${label} for your Awa Biz Suite account. Credits are added to your balance immediately on payment.`,
            },
          },
          quantity: 1,
        }],
        success_url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}addonCreditId=${addonCredit.id}`,
        cancel_url: cancelUrl,
        metadata: {
          addonCreditId: addonCredit.id.toString(),
          addonVendorId: id.toString(),
          addonResource: resourceKey,
          addonQuantity: quantity.toString(),
        },
      });

      return { sessionId: session.id, url: session.url };
    });

    // Store the Stripe session id so we can match it in the webhook
    await db.update(vendorAddonCreditsTable)
      .set({ gatewayPaymentId: result.sessionId, updatedAt: new Date() })
      .where(eq(vendorAddonCreditsTable.id, addonCredit.id));

    res.json({ url: result.url, addonCreditId: addonCredit.id });
  } catch (err) {
    // Clean up pending row on error
    await db.delete(vendorAddonCreditsTable).where(eq(vendorAddonCreditsTable.id, addonCredit.id));
    throw err;
  }
});

// ─── GET /vendors/:id/addons ──────────────────────────────────────────────────

router.get("/vendors/:id/addons", async (req, res): Promise<void> => {
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

  const addons = await db
    .select()
    .from(vendorAddonCreditsTable)
    .where(
      and(
        eq(vendorAddonCreditsTable.vendorId, id),
        or(
          eq(vendorAddonCreditsTable.status, "active"),
          eq(vendorAddonCreditsTable.status, "pending"),
          eq(vendorAddonCreditsTable.status, "exhausted"),
        ),
      ),
    )
    .orderBy(desc(vendorAddonCreditsTable.createdAt));

  const rates = await getOverageRates();

  res.json({
    addons: addons.map((a) => ({
      id: a.id,
      resource: a.resource,
      label: RESOURCE_LABEL[a.resource as ResourceKey] ?? a.resource,
      unitsGranted: Number(a.unitsGranted),
      unitsRemaining: Number(a.unitsRemaining),
      unitRateUsd: Number(a.unitRateUsd),
      totalPaidUsd: Number(a.totalPaidUsd),
      gateway: a.gateway,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      expiresAt: a.expiresAt?.toISOString() ?? null,
    })),
    bundleSizes: ADDON_BUNDLE_SIZES,
    overageRates: rates,
  });
});

// ─── GET /vendors/:id/addons/options ─────────────────────────────────────────
// Returns the available bundle sizes and current overage rates — used by the
// "Buy more capacity" UI before the vendor has authenticated their choice.

router.get("/vendors/:id/addons/options", async (req, res): Promise<void> => {
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

  const rates = await getOverageRates();
  const gateway: "stripe" | "paystack" =
    vendor.subscriptionProvider === "paystack" ? "paystack" : "stripe";

  res.json({
    bundleSizes: ADDON_BUNDLE_SIZES,
    overageRates: rates,
    gateway,
    resourceLabels: RESOURCE_LABEL,
  });
});

export default router;
