/**
 * Webhook-only router — public, no auth required.
 * Signature verification is done inside each handler.
 * Mounted BEFORE requireAuth in routes/index.ts.
 */
import { Router } from "express";
import Stripe from "stripe";
import crypto from "crypto";
import { db, paymentsTable, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

/**
 * POST /payments/stripe/webhook
 * Stripe sends checkout.session.completed events here.
 * Raw body required — mounted before express.json().
 */
router.post("/payments/stripe/webhook", async (req, res): Promise<void> => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET not configured" });
    return;
  }
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" });
    return;
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) { res.status(400).json({ error: "Missing stripe-signature header" }); return; }

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(stripeKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event = stripe.webhooks.constructEvent(req.body as any, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: `Webhook signature verification failed: ${msg}` });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId ? parseInt(session.metadata.orderId) : null;

    await db
      .update(paymentsTable)
      .set({ status: "paid", updatedAt: new Date() })
      .where(eq(paymentsTable.providerReference, session.id));

    if (orderId) {
      await db
        .update(ordersTable)
        .set({ paymentStatus: "paid", updatedAt: new Date() })
        .where(eq(ordersTable.id, orderId));
    }

    console.info(`[stripe webhook] checkout.session.completed — session=${session.id} order=${orderId}`);
  }

  res.json({ received: true });
});

/**
 * POST /payments/paystack/webhook
 * Paystack sends charge.success events here.
 * Raw body required — mounted before express.json().
 */
router.post("/payments/paystack/webhook", async (req, res): Promise<void> => {
  const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    res.status(500).json({ error: "PAYSTACK_WEBHOOK_SECRET not configured" });
    return;
  }

  const rawBody = req.body as Buffer;
  const hash = crypto.createHmac("sha512", webhookSecret).update(rawBody).digest("hex");
  const incomingHash = req.headers["x-paystack-signature"] as string;

  if (!incomingHash || hash !== incomingHash) {
    res.status(400).json({ error: "Invalid Paystack webhook signature" });
    return;
  }

  const event = JSON.parse(rawBody.toString()) as {
    event: string;
    data: { reference: string; metadata?: { orderId?: string } };
  };

  if (event.event === "charge.success") {
    const { reference, metadata } = event.data;
    const orderId = metadata?.orderId ? parseInt(metadata.orderId) : null;

    await db
      .update(paymentsTable)
      .set({ status: "paid", updatedAt: new Date() })
      .where(eq(paymentsTable.providerReference, reference));

    if (orderId) {
      await db
        .update(ordersTable)
        .set({ paymentStatus: "paid", updatedAt: new Date() })
        .where(eq(ordersTable.id, orderId));
    }

    console.info(`[paystack webhook] charge.success — reference=${reference} order=${orderId}`);
  }

  res.json({ received: true });
});

export default router;
