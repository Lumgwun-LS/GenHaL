/**
 * Stripe Connect — vendor sub-account onboarding & status.
 *
 * POST /payments/stripe-connect/onboard   — create Express account + onboarding link
 * GET  /payments/stripe-connect/status    — check vendor's Connect account status
 * POST /payments/stripe-connect/refresh   — re-generate expired onboarding link
 * DELETE /payments/stripe-connect/disconnect — detach Connect account from vendor
 * POST /payments/stripe-connect/webhook   — Stripe Connect events (account.updated)
 *
 * When a vendor has stripeConnectAccountId + stripeConnectOnboarded = true,
 * the site checkout automatically routes funds to their connected account
 * (via transfer_data.destination). No separate key sharing needed.
 */

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, vendorsTable } from "@workspace/db";
import Stripe from "stripe";

const router = Router();

function getPlatformStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key);
}

function isAdminId(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean).includes(userId);
}

async function resolveVendorForUser(userId: string) {
  const [v] = await db
    .select({ id: vendorsTable.id, name: vendorsTable.name, email: vendorsTable.email,
              stripeConnectAccountId: vendorsTable.stripeConnectAccountId,
              stripeConnectOnboarded: vendorsTable.stripeConnectOnboarded })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, userId))
    .limit(1);
  return v ?? null;
}

// ── POST /payments/stripe-connect/onboard ────────────────────────────────────
// Creates an Express connected account (if needed) and returns an onboarding URL.
// The vendor pastes that link to complete Stripe KYC.

router.post("/payments/stripe-connect/onboard", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await resolveVendorForUser(userId);
  if (!vendor) { res.status(403).json({ error: "Vendor account not found" }); return; }

  const stripe = getPlatformStripe();
  const baseHost = process.env.SITE_BASE_URL ?? `${req.protocol}://${req.headers.host}`;
  const returnUrl  = (req.body.returnUrl  as string | undefined) ?? `${baseHost}/payments?stripe_connect=return`;
  const refreshUrl = (req.body.refreshUrl as string | undefined) ?? `${baseHost}/payments?stripe_connect=refresh`;

  // Re-use existing account ID if vendor already started onboarding
  let accountId = vendor.stripeConnectAccountId ?? null;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: vendor.email,
      metadata: { vendorId: String(vendor.id), vendorName: vendor.name },
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
    });
    accountId = account.id;

    await db.update(vendorsTable)
      .set({ stripeConnectAccountId: accountId })
      .where(eq(vendorsTable.id, vendor.id));
  }

  const link = await stripe.accountLinks.create({
    account:     accountId,
    type:        "account_onboarding",
    return_url:  returnUrl,
    refresh_url: refreshUrl,
  });

  res.json({ accountId, onboardingUrl: link.url });
});

// ── GET /payments/stripe-connect/status ──────────────────────────────────────

router.get("/payments/stripe-connect/status", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await resolveVendorForUser(userId);
  if (!vendor) { res.status(403).json({ error: "Vendor account not found" }); return; }

  if (!vendor.stripeConnectAccountId) {
    res.json({ connected: false, onboarded: false }); return;
  }

  try {
    const stripe = getPlatformStripe();
    const account = await stripe.accounts.retrieve(vendor.stripeConnectAccountId);

    const onboarded = account.details_submitted && !account.requirements?.currently_due?.length;

    // Sync the onboarded flag if it changed
    if (onboarded !== vendor.stripeConnectOnboarded) {
      await db.update(vendorsTable)
        .set({ stripeConnectOnboarded: onboarded ?? false })
        .where(eq(vendorsTable.id, vendor.id));
    }

    res.json({
      connected:       true,
      onboarded:       onboarded ?? false,
      accountId:       vendor.stripeConnectAccountId,
      chargesEnabled:  account.charges_enabled,
      payoutsEnabled:  account.payouts_enabled,
      requirementsCount: account.requirements?.currently_due?.length ?? 0,
    });
  } catch (err) {
    console.error("[stripe-connect status]", err);
    res.json({ connected: true, onboarded: vendor.stripeConnectOnboarded ?? false, accountId: vendor.stripeConnectAccountId });
  }
});

// ── POST /payments/stripe-connect/refresh ────────────────────────────────────
// Re-generates an onboarding link when the previous one expired.

router.post("/payments/stripe-connect/refresh", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await resolveVendorForUser(userId);
  if (!vendor?.stripeConnectAccountId) {
    res.status(400).json({ error: "No Stripe Connect account found. Please start onboarding first." }); return;
  }

  const stripe = getPlatformStripe();
  const baseHost = process.env.SITE_BASE_URL ?? `${req.protocol}://${req.headers.host}`;
  const returnUrl  = (req.body.returnUrl  as string | undefined) ?? `${baseHost}/payments?stripe_connect=return`;
  const refreshUrl = (req.body.refreshUrl as string | undefined) ?? `${baseHost}/payments?stripe_connect=refresh`;

  const link = await stripe.accountLinks.create({
    account:     vendor.stripeConnectAccountId,
    type:        "account_onboarding",
    return_url:  returnUrl,
    refresh_url: refreshUrl,
  });

  res.json({ onboardingUrl: link.url });
});

// ── DELETE /payments/stripe-connect/disconnect ───────────────────────────────

router.delete("/payments/stripe-connect/disconnect", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await resolveVendorForUser(userId);
  if (!vendor) { res.status(403).json({ error: "Vendor not found" }); return; }

  await db.update(vendorsTable)
    .set({ stripeConnectAccountId: null, stripeConnectOnboarded: false })
    .where(eq(vendorsTable.id, vendor.id));

  res.json({ ok: true });
});

// ── POST /payments/stripe-connect/webhook ────────────────────────────────────
// Handles Stripe Connect events (account.updated).
// Register this URL in Stripe Connect Settings → Webhooks.

router.post("/payments/stripe-connect/webhook", async (req, res): Promise<void> => {
  const sig        = req.headers["stripe-signature"] as string | undefined;
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  let event: Stripe.Event;
  try {
    const stripe = getPlatformStripe();
    if (webhookSecret && sig) {
      const rawBody = (req as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } else {
      event = req.body as Stripe.Event;
    }
  } catch (err) {
    res.status(400).json({ error: `Webhook error: ${err instanceof Error ? err.message : "unknown"}` }); return;
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const onboarded = account.details_submitted && !(account.requirements?.currently_due?.length);

    // Find vendor by stripeConnectAccountId and sync the onboarded flag
    await db.update(vendorsTable)
      .set({ stripeConnectOnboarded: onboarded ?? false })
      .where(eq(vendorsTable.stripeConnectAccountId, account.id));
  }

  res.json({ received: true });
});

export default router;
