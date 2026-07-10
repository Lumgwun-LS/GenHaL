import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, paymentsTable, ordersTable, webhookEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import Stripe from "stripe";
import stripeRouter from "./stripe";
import paystackRouter from "./paystack";
import { retryWebhookEventById } from "./webhooks";
import { resolveGatewayField } from "../../lib/platform-gateways";

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
    res.json({ success: true, eventId: result.eventId });
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
