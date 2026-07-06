/**
 * Webhook-only router — public, no auth required.
 * Signature verification is done inside each handler.
 * Mounted BEFORE requireAuth in routes/index.ts.
 */
import { Router } from "express";
import Stripe from "stripe";
import crypto from "crypto";
import { db, paymentsTable, ordersTable, webhookEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

/**
 * Persist a webhook event and return whether this event is a duplicate.
 * Returns true if already processed (caller should skip business logic).
 */
async function logWebhookEvent(opts: {
  provider: string;
  eventType: string;
  eventId: string;
  reference: string | null;
  rawPayload: unknown;
}): Promise<boolean> {
  try {
    await db.insert(webhookEventsTable).values({
      provider: opts.provider,
      eventType: opts.eventType,
      eventId: opts.eventId,
      reference: opts.reference,
      rawPayload: opts.rawPayload as Record<string, unknown>,
      processedAt: new Date(),
    });
    return false; // new event — proceed
  } catch (err: unknown) {
    // Unique constraint violation on event_id = duplicate
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("webhook_events_event_id_unique") || msg.includes("unique")) {
      console.warn(`[webhook] duplicate event skipped — id=${opts.eventId}`);
      return true; // duplicate — skip
    }
    throw err; // unexpected error — rethrow
  }
}

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

  const session = event.type === "checkout.session.completed"
    ? (event.data.object as Stripe.Checkout.Session)
    : null;

  const isDuplicate = await logWebhookEvent({
    provider: "stripe",
    eventType: event.type,
    eventId: event.id,
    reference: session?.id ?? null,
    rawPayload: event,
  });

  if (!isDuplicate && event.type === "checkout.session.completed" && session) {
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
    data: { id?: number | string; reference: string; metadata?: { orderId?: string } };
  };

  // Paystack uses numeric event IDs; fall back to reference+type as composite key
  const eventId = event.data.id
    ? `paystack-${event.data.id}`
    : `paystack-${event.event}-${event.data.reference}`;

  const isDuplicate = await logWebhookEvent({
    provider: "paystack",
    eventType: event.event,
    eventId,
    reference: event.data.reference,
    rawPayload: event,
  });

  if (!isDuplicate && event.event === "charge.success") {
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
