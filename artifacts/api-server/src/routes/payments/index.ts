import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, paymentsTable, ordersTable, webhookEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import Stripe from "stripe";
import stripeRouter from "./stripe";
import paystackRouter from "./paystack";
import flutterwaveRouter, { FLUTTERWAVE_BASE } from "./flutterwave";
import nombaRouter, { NOMBA_BASE, getNombaCreds, issueNombaToken } from "./nomba";
import remitaRouter from "./remita";
import { retryWebhookEventById } from "./webhooks";
import { resolveGatewayField } from "../../lib/platform-gateways";
import { notifyVendorPaymentStatus } from "../../lib/push";

const PAYSTACK_BASE = "https://api.paystack.co";

/** Returns true if the calling Clerk user is listed in ADMIN_USER_IDS env var. */
function isAdmin(userId: string): boolean {
  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

const router = Router();

// Mount sub-routers
router.use(stripeRouter);
router.use(paystackRouter);
router.use(flutterwaveRouter);
router.use(nombaRouter);
router.use(remitaRouter);

/**
 * POST /payments/:id/refund
 * Initiates a full refund for a paid payment via the original gateway.
 */
router.post("/payments/:id/refund", async (req, res): Promise<void> => {
  const paymentId = parseInt(req.params.id);
  if (isNaN(paymentId)) {
    res.status(400).json({ error: "Invalid payment id" });
    return;
  }

  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  if (payment.status !== "paid") {
    res.status(409).json({ error: `Cannot refund a payment with status '${payment.status}'` });
    return;
  }

  if (payment.provider === "stripe") {
    const stripeKey = await resolveGatewayField("stripe", "secretKey");
    if (!stripeKey) {
      res.status(503).json({ error: "Stripe is not configured. Add a platform Stripe key in Admin \u2192 Payment Gateways." });
      return;
    }
    const stripe = new Stripe(stripeKey);

    // The providerReference is the Checkout Session ID — retrieve PaymentIntent from it
    const session = await stripe.checkout.sessions.retrieve(payment.providerReference);
    const paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

    if (!paymentIntentId) {
      res.status(502).json({ error: "Could not resolve Stripe PaymentIntent from session" });
      return;
    }

    await stripe.refunds.create({ payment_intent: paymentIntentId });
  } else if (payment.provider === "paystack") {
    const paystackKey = await resolveGatewayField("paystack", "secretKey");
    if (!paystackKey) {
      res.status(503).json({ error: "Paystack is not configured. Add a platform Paystack key in Admin \u2192 Payment Gateways." });
      return;
    }

    const response = await fetch(`${PAYSTACK_BASE}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transaction: payment.providerReference }),
    });

    const data = (await response.json()) as { status: boolean; message: string };
    if (!data.status) {
      res.status(502).json({ error: `Paystack refund error: ${data.message}` });
      return;
    }
  } else if (payment.provider === "flutterwave") {
    const flutterwaveKey = await resolveGatewayField("flutterwave", "secretKey");
    if (!flutterwaveKey) {
      res.status(503).json({ error: "Flutterwave is not configured. Add a platform Flutterwave key in Admin \u2192 Payment Gateways." });
      return;
    }

    // The providerReference is the tx_ref we generated at checkout — Flutterwave's
    // refund endpoint needs the numeric transaction id, so resolve it first.
    const verifyResponse = await fetch(
      `${FLUTTERWAVE_BASE}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(payment.providerReference)}`,
      { headers: { Authorization: `Bearer ${flutterwaveKey}` } },
    );
    const verifyData = (await verifyResponse.json().catch(() => ({}))) as {
      status?: string;
      message?: string;
      data?: { id?: number };
    };
    if (verifyData.status !== "success" || !verifyData.data?.id) {
      res.status(502).json({ error: `Flutterwave error: could not resolve transaction (${verifyData.message ?? "not found"})` });
      return;
    }

    const refundResponse = await fetch(`${FLUTTERWAVE_BASE}/transactions/${verifyData.data.id}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${flutterwaveKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const refundData = (await refundResponse.json().catch(() => ({}))) as { status?: string; message?: string };
    if (refundData.status !== "success") {
      res.status(502).json({ error: `Flutterwave refund error: ${refundData.message ?? "refund failed"}` });
      return;
    }
  } else if (payment.provider === "nomba") {
    const creds = await getNombaCreds();
    if (!creds) {
      res.status(503).json({ error: "Nomba is not configured. Add a platform Nomba key in Admin \u2192 Payment Gateways." });
      return;
    }

    let accessToken: string;
    try {
      accessToken = await issueNombaToken(creds);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: `Nomba auth failed: ${msg}` });
      return;
    }

    const refundResponse = await fetch(`${NOMBA_BASE}/transactions/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        accountId: creds.accountId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order: { orderReference: payment.providerReference } }),
    });
    const refundData = (await refundResponse.json().catch(() => ({}))) as {
      code?: string;
      description?: string;
      message?: string;
    };
    if (!refundResponse.ok) {
      res.status(502).json({ error: `Nomba refund error: ${refundData.description ?? refundData.message ?? "refund failed"}` });
      return;
    }
  } else if (payment.provider === "remita") {
    // Remita has no generic refund API — reversals must be requested directly
    // with Remita/the bank and reconciled manually. Tell the admin clearly
    // instead of pretending this succeeded or calling it "unknown provider".
    res.status(501).json({
      error: "Remita does not support refunds via API. Contact Remita support to reverse this transaction, then update the payment status manually.",
    });
    return;
  } else {
    res.status(400).json({ error: `Unknown provider '${payment.provider}'` });
    return;
  }

  // Mark payment as refunded
  await db
    .update(paymentsTable)
    .set({ status: "refunded", updatedAt: new Date() })
    .where(eq(paymentsTable.id, paymentId));

  // Mark associated order as refunded if present
  if (payment.orderId) {
    await db
      .update(ordersTable)
      .set({ paymentStatus: "refunded", updatedAt: new Date() })
      .where(eq(ordersTable.id, payment.orderId));
  }

  await notifyVendorPaymentStatus(payment.vendorId, "refunded", payment.amount, payment.currency);

  console.info(`[payments] refund issued — id=${paymentId} provider=${payment.provider} reference=${payment.providerReference}`);
  res.json({ success: true, paymentId, status: "refunded" });
});

/**
 * GET /payments/webhook-events
 * List recent webhook events for debugging. Supports ?provider=&limit= query params.
 */
router.get("/payments/webhook-events", async (req, res): Promise<void> => {
  const { provider, limit } = req.query as { provider?: string; limit?: string };
  const take = Math.min(parseInt(limit ?? "100") || 100, 500);

  let events = await db
    .select()
    .from(webhookEventsTable)
    .orderBy(desc(webhookEventsTable.receivedAt))
    .limit(take);

  if (provider) events = events.filter((e) => e.provider === provider);

  res.json({ events, total: events.length });
});

/**
 * POST /payments/webhook-events/:id/retry
 * Re-processes a skipped/failed webhook event's stored raw payload through the
 * same business logic as the live handler. Admin-only recovery action.
 */
router.post("/payments/webhook-events/:id/retry", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid webhook event id" });
    return;
  }

  try {
    const result = await retryWebhookEventById(id);
    res.json({ success: true, eventId: result.eventId, warning: result.warning });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : "Retry failed";
    res.status(statusCode).json({ error: message });
  }
});

/**
 * GET /payments
 * List all payment transactions. Filterable by vendorId, provider, status.
 */
router.get("/payments", async (req, res): Promise<void> => {
  const { vendorId, provider, status } = req.query as {
    vendorId?: string;
    provider?: string;
    status?: string;
  };

  let payments = await db
    .select()
    .from(paymentsTable)
    .orderBy(desc(paymentsTable.createdAt));

  if (vendorId) payments = payments.filter((p) => p.vendorId === parseInt(vendorId));
  if (provider) payments = payments.filter((p) => p.provider === provider);
  if (status) payments = payments.filter((p) => p.status === status);

  // Compute revenue summary
  const paidPayments = payments.filter((p) => p.status === "paid");
  const revenueByProvider = {
    stripe: paidPayments
      .filter((p) => p.provider === "stripe")
      .reduce((s, p) => s + parseFloat(p.amount), 0),
    paystack: paidPayments
      .filter((p) => p.provider === "paystack")
      .reduce((s, p) => s + parseFloat(p.amount), 0),
  };

  res.json({
    payments: payments.map((p) => ({ ...p, amount: parseFloat(p.amount) })),
    summary: {
      total: payments.length,
      paid: paidPayments.length,
      totalRevenue: paidPayments.reduce((s, p) => s + parseFloat(p.amount), 0),
      revenueByProvider,
    },
  });
});

export default router;
