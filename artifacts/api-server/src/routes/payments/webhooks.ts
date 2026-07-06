/**
 * Webhook-only router — public, no auth required.
 * Signature verification is done inside each handler.
 * Mounted BEFORE requireAuth in routes/index.ts.
 */
import { Router } from "express";
import Stripe from "stripe";
import crypto from "crypto";
import { db, paymentsTable, ordersTable, webhookEventsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendSlackAlert } from "../../lib/slack";

const router = Router();

/**
 * Persist a webhook event and return whether this event should be skipped.
 * processedAt is intentionally NOT set here — it is set after successful
 * business logic so that null means "not yet processed" or "failed".
 *
 * On retry (duplicate event_id): returns isDuplicate=true for already-processed
 * events, but isDuplicate=false for previously-failed events so the handler
 * retries business logic and can recover.
 */
async function logWebhookEvent(opts: {
  provider: string;
  eventType: string;
  eventId: string;
  reference: string | null;
  rawPayload: unknown;
}): Promise<{ isDuplicate: boolean }> {
  try {
    await db.insert(webhookEventsTable).values({
      provider: opts.provider,
      eventType: opts.eventType,
      eventId: opts.eventId,
      reference: opts.reference,
      rawPayload: opts.rawPayload as Record<string, unknown>,
      // processedAt deliberately omitted — set to null until business logic succeeds
    });
    return { isDuplicate: false };
  } catch (err: unknown) {
    // Unique constraint violation on event_id = seen before
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("webhook_events_event_id_unique") || msg.includes("unique")) {
      // Check if the previous attempt failed — if so, clear the error and allow retry
      const [existing] = await db
        .select({
          processedAt: webhookEventsTable.processedAt,
          errorMessage: webhookEventsTable.errorMessage,
        })
        .from(webhookEventsTable)
        .where(eq(webhookEventsTable.eventId, opts.eventId));

      if (existing && existing.processedAt === null && existing.errorMessage !== null) {
        // Previously failed — clear error so retry can proceed
        await db
          .update(webhookEventsTable)
          .set({ errorMessage: null })
          .where(eq(webhookEventsTable.eventId, opts.eventId));
        console.info(`[webhook] retrying previously failed event — id=${opts.eventId}`);
        return { isDuplicate: false };
      }

      console.warn(`[webhook] duplicate event skipped — id=${opts.eventId}`);
      return { isDuplicate: true };
    }
    throw err; // unexpected error — rethrow
  }
}

/** Mark a webhook event as successfully processed. */
async function markWebhookProcessed(eventId: string): Promise<void> {
  await db
    .update(webhookEventsTable)
    .set({ processedAt: new Date() })
    .where(eq(webhookEventsTable.eventId, eventId));
}

/** Store an error on a webhook event row and fire a Slack alert. */
async function markWebhookFailed(
  eventId: string,
  provider: string,
  eventType: string,
  err: unknown,
): Promise<void> {
  const errorMessage = err instanceof Error ? err.message : String(err);

  try {
    await db
      .update(webhookEventsTable)
      .set({ errorMessage })
      .where(eq(webhookEventsTable.eventId, eventId));
  } catch (dbErr) {
    console.error("[webhook] Failed to persist error_message to DB:", dbErr);
  }

  const alertText =
    `🚨 *Webhook processing failed*\n` +
    `• Provider: \`${provider}\`\n` +
    `• Event type: \`${eventType}\`\n` +
    `• Event ID: \`${eventId}\`\n` +
    `• Error: ${errorMessage}`;

  await sendSlackAlert(alertText);
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

  const { isDuplicate } = await logWebhookEvent({
    provider: "stripe",
    eventType: event.type,
    eventId: event.id,
    reference: session?.id ?? null,
    rawPayload: event,
  });

  if (isDuplicate) {
    res.json({ received: true });
    return;
  }

  if (event.type === "checkout.session.completed" && session) {
    const orderId = session.metadata?.orderId ? parseInt(session.metadata.orderId) : null;

    try {
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

      await markWebhookProcessed(event.id);
      console.info(`[stripe webhook] checkout.session.completed — session=${session.id} order=${orderId}`);
    } catch (err) {
      console.error(`[stripe webhook] Business logic failed — event=${event.id}:`, err);
      await markWebhookFailed(event.id, "stripe", event.type, err);
      // Return 500 so Stripe retries — idempotent inserts protect against double-processing.
      res.status(500).json({ error: "Internal processing error — will retry" });
      return;
    }
  } else {
    // Unhandled but valid event type — mark as processed/skipped so it doesn't
    // appear as a stale unprocessed event in alerts.
    await markWebhookProcessed(event.id);
    console.info(`[stripe webhook] unhandled event type skipped — type=${event.type} id=${event.id}`);
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

  const { isDuplicate } = await logWebhookEvent({
    provider: "paystack",
    eventType: event.event,
    eventId,
    reference: event.data.reference,
    rawPayload: event,
  });

  if (isDuplicate) {
    res.json({ received: true });
    return;
  }

  if (event.event === "charge.success") {
    const { reference, metadata } = event.data;
    const orderId = metadata?.orderId ? parseInt(metadata.orderId) : null;

    try {
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

      await markWebhookProcessed(eventId);
      console.info(`[paystack webhook] charge.success — reference=${reference} order=${orderId}`);
    } catch (err) {
      console.error(`[paystack webhook] Business logic failed — event=${eventId}:`, err);
      await markWebhookFailed(eventId, "paystack", event.event, err);
      // Return 500 so Paystack retries — idempotent inserts protect against double-processing.
      res.status(500).json({ error: "Internal processing error — will retry" });
      return;
    }
  } else {
    // Unhandled but valid event type — mark as processed/skipped so it doesn't
    // appear as a stale unprocessed event in alerts.
    await markWebhookProcessed(eventId);
    console.info(`[paystack webhook] unhandled event type skipped — type=${event.event} id=${eventId}`);
  }

  res.json({ received: true });
});

/**
 * Background job: alert on stale unprocessed webhook events.
 * Fires for events older than 5 minutes that are still unprocessed
 * (processedAt IS NULL). Runs every 60 seconds.
 */
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 60 * 1000; // 1 minute

const alertedEventIds = new Set<string>(); // avoid repeat alerts within the same process

async function checkStaleWebhookEvents(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

    // Only alert on events that explicitly failed (errorMessage set).
    // Unhandled event types are marked processed immediately, so a null
    // processedAt after 5 minutes means business logic threw before it could
    // record success — confirmed failures, not just unknown event types.
    const stale = await db
      .select({
        eventId: webhookEventsTable.eventId,
        provider: webhookEventsTable.provider,
        eventType: webhookEventsTable.eventType,
        errorMessage: webhookEventsTable.errorMessage,
        receivedAt: webhookEventsTable.receivedAt,
      })
      .from(webhookEventsTable)
      .where(
        sql`${webhookEventsTable.processedAt} IS NULL AND ${webhookEventsTable.errorMessage} IS NOT NULL AND ${webhookEventsTable.receivedAt} < ${cutoff}`,
      );

    for (const row of stale) {
      if (alertedEventIds.has(row.eventId)) continue;

      const reason = row.errorMessage
        ? `Error: ${row.errorMessage}`
        : "No error recorded — event may have been skipped without being marked processed.";

      await sendSlackAlert(
        `⏰ *Stale unprocessed webhook event* (>5 min)\n` +
        `• Provider: \`${row.provider}\`\n` +
        `• Event type: \`${row.eventType}\`\n` +
        `• Event ID: \`${row.eventId}\`\n` +
        `• Received: ${row.receivedAt.toISOString()}\n` +
        `• ${reason}`,
      );

      alertedEventIds.add(row.eventId);
    }
  } catch (err) {
    console.error("[webhook] Stale event checker failed:", err);
  }
}

// Start the background checker after a short delay so the server is fully up
setTimeout(() => {
  void checkStaleWebhookEvents();
  setInterval(() => void checkStaleWebhookEvents(), POLL_INTERVAL_MS);
}, 10_000);

export default router;
