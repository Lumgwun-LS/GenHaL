/**
 * /external/payments — payment initiation bridge for Awajimaa app users.
 *
 * POST /external/payments/initialize
 *   Auto-selects Stripe or Paystack based on the currency field in the request.
 *   Currencies handled by Paystack: NGN, GHS, ZAR, KES.
 *   Everything else routes to Stripe.
 *
 *   Key resolution order:
 *     1. Vendor's own key (if tier-eligible and test-passed)
 *     2. Platform key from environment
 *     3. 503 if neither is available
 */

import { Router } from "express";
import { db, paymentsTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireExternalAuth } from "../../middlewares/requireExternalAuth";
import Stripe from "stripe";
import crypto from "crypto";
import { resolveStripeKey, resolvePaystackKey } from "../../lib/vendor-keys";

const router = Router();
router.use(requireExternalAuth);

const PAYSTACK_CURRENCIES = new Set(["NGN", "GHS", "ZAR", "KES"]);
const PAYSTACK_BASE = "https://api.paystack.co";

function selectProvider(
  currency: string,
  vendor: { stripeEnabled: boolean; paystackEnabled: boolean },
): "stripe" | "paystack" | null {
  const wantsPaystack = PAYSTACK_CURRENCIES.has(currency.toUpperCase());
  if (wantsPaystack && vendor.paystackEnabled) return "paystack";
  if (vendor.stripeEnabled) return "stripe";
  if (vendor.paystackEnabled) return "paystack";
  return null;
}

router.post("/payments/initialize", async (req, res): Promise<void> => {
  const { vendorId } = req.externalUser!;

  const {
    orderId,
    amount,
    currency: reqCurrency,
    email,
    callbackUrl,
    successUrl,
    cancelUrl,
    description,
  } = req.body as {
    orderId?: number;
    amount: number;
    currency?: string;
    email?: string;
    callbackUrl?: string;
    successUrl?: string;
    cancelUrl?: string;
    description?: string;
  };

  if (!amount) {
    res.status(400).json({ error: "amount is required" });
    return;
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const currency = (reqCurrency ?? vendor.defaultCurrency ?? "USD").toUpperCase();
  const provider = selectProvider(currency, vendor);

  if (!provider) {
    res.status(503).json({
      error: "No payment gateway is enabled for this vendor. Contact the vendor admin.",
    });
    return;
  }

  if (provider === "stripe") {
    let stripeKey: string;
    try {
      stripeKey = await resolveStripeKey(vendorId, vendor);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(503).json({ error: msg });
      return;
    }

    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: Math.round(amount * 100),
          product_data: { name: description ?? `Order #${orderId ?? ""}` },
        },
      }],
      success_url: successUrl ?? callbackUrl ?? "https://vendorhub.app/success",
      cancel_url: cancelUrl ?? callbackUrl ?? "https://vendorhub.app/cancel",
      metadata: {
        orderId: orderId?.toString() ?? "",
        vendorId: vendorId.toString(),
        source: "awajimaa",
      },
    });

    const [payment] = await db.insert(paymentsTable).values({
      orderId: orderId ?? null,
      vendorId,
      provider: "stripe",
      providerReference: session.id,
      amount: amount.toString(),
      currency,
      status: "pending",
      metadata: { sessionId: session.id, sessionUrl: session.url, source: "awajimaa" },
    }).returning();

    res.json({ provider: "stripe", paymentId: payment!.id, url: session.url, reference: session.id });
    return;
  }

  // ── Paystack ──────────────────────────────────────────────────────────────
  if (!email) { res.status(400).json({ error: "email is required for Paystack payments" }); return; }

  let paystackKey: string;
  try {
    paystackKey = await resolvePaystackKey(vendorId, vendor);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: msg });
    return;
  }

  const paystackRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: Math.round(amount * 100),
      currency,
      callback_url: callbackUrl,
      metadata: {
        orderId: orderId?.toString() ?? "",
        vendorId: vendorId.toString(),
        source: "awajimaa",
        description: description ?? `Order #${orderId ?? ""}`,
      },
    }),
  });

  const paystackData = (await paystackRes.json()) as {
    status: boolean;
    message: string;
    data?: { authorization_url: string; access_code: string; reference: string };
  };

  if (!paystackData.status || !paystackData.data) {
    res.status(502).json({ error: `Paystack error: ${paystackData.message}` });
    return;
  }

  const { authorization_url, reference } = paystackData.data;

  const [payment] = await db.insert(paymentsTable).values({
    orderId: orderId ?? null,
    vendorId,
    provider: "paystack",
    providerReference: reference,
    amount: amount.toString(),
    currency,
    status: "pending",
    metadata: { reference, authorization_url, source: "awajimaa" },
  }).returning();

  res.json({ provider: "paystack", paymentId: payment!.id, url: authorization_url, reference });
});

export default router;
