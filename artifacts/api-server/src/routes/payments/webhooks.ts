/**
 * Webhook-only router — public, no auth required.
 * Signature verification is done inside each handler.
 * Mounted BEFORE requireAuth in routes/index.ts.
 *
 * DB-outage resilience:
 * When the database is unreachable the route returns HTTP 200 (so the provider
 * does not retry) and queues the event in the in-memory webhook buffer.  A
 * background drainer replays buffered events every 30 s until the DB recovers.
 *
 * Concurrent-delivery safety:
 * Each event is claimed via an in-progress sentinel set atomically during INSERT
 * (first delivery) or via a single atomic UPDATE … RETURNING (retry path).
 * Timed-out sentinels (handler crashed mid-run) are reset by the background
 * stale-sentinel cleanup so future retries can reclaim the event.
 */
import { Router } from "express";
import Stripe from "stripe";
import crypto from "crypto";
import { db, paymentsTable, ordersTable, vendorsTable, webhookEventsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendSlackAlert } from "../../lib/slack";
import {
  enqueueWebhookEvent,
  registerSlackAlerter,
} from "../../lib/webhook-buffer";

const router = Router();

// Wire Slack into the buffer so it can send alerts on DB outage / recovery
registerSlackAlerter(sendSlackAlert);

// ── DB-outage detection ───────────────────────────────────────────────────────

function isDbUnavailableError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const code = (err as { code?: string }).code ?? "";

  if (["econnrefused", "econnreset", "etimedout", "enotfound", "epipe", "ehostunreach"].includes(code.toLowerCase())) return true;
  if (["08000", "08006", "08001", "08004", "57p01", "53300", "57014"].includes(code)) return true;
  if (
    msg.includes("connection terminated") ||
    msg.includes("connection closed") ||
    msg.includes("connection refused") ||
    msg.includes("server closed the connection unexpectedly") ||
    msg.includes("cannot read from a closed connection") ||
    msg.includes("query read timeout") ||
    msg.includes("connect etimedout") ||
    msg.includes("connect econnrefused") ||
    msg.includes("getaddrinfo") ||
    msg.includes("too many connections") ||
    msg.includes("the database system is shut") ||
    msg.includes("the database system is starting up") ||
    msg.includes("connection is closed") ||
    msg.includes("socket hang up") ||
    msg.includes("pool is draining") ||
    msg.includes("client checkout timed out")
  ) return true;
  return false;
}

// ── In-progress sentinel ──────────────────────────────────────────────────────

/**
 * Sentinels older than this are considered stale (handler crashed mid-run).
 * The background checker resets them so future retries can reclaim the event.
 */
const IN_PROGRESS_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function makeSentinel(): string {
  return `[in-progress:${Date.now()}]`;
}

function isSentinel(s: string | null | undefined): boolean {
  return typeof s === "string" && s.startsWith("[in-progress:");
}

function isSentinelTimedOut(s: string): boolean {
  const match = s.match(/^\[in-progress:(\d+)\]$/);
  if (!match) return true; // malformed → treat as timed-out so it can be reclaimed
  return Date.now() - Number(match[1]) > IN_PROGRESS_TIMEOUT_MS;
}

// ── Core DB helpers ───────────────────────────────────────────────────────────

/**
 * Persist a webhook event and return whether this event should be skipped.
 *
 * Ownership model (prevents concurrent double-processing):
 *
 *  First delivery:
 *    INSERT sets errorMessage = "[in-progress:ts]" atomically.  A concurrent
 *    duplicate hitting the unique constraint sees the sentinel in the atomic
 *    UPDATE claim below, gets 0 RETURNING rows → isDuplicate=true.
 *
 *  Retry (unique constraint hit):
 *    A single atomic UPDATE … WHERE … RETURNING claims the row.  Two
 *    concurrent retries race on the same SQL; the DB row-lock serialises them
 *    and only one gets RETURNING rows > 0.
 *
 *    Claimable conditions (all checked in the single UPDATE):
 *      • processedAt IS NULL  — not yet successfully processed
 *      • errorMessage IS NULL OR NOT a live sentinel (real error → ready retry)
 *
 *    Timed-out sentinels are reset to NULL by checkStaleWebhookEvents, so by
 *    the time this UPDATE runs any claimable timed-out sentinel has been cleared.
 *
 *  Success: markWebhookProcessed sets processedAt + clears errorMessage.
 *  Failure: markWebhookFailed overwrites sentinel with real error (re-claimable).
 *
 * Throws on DB connectivity errors — callers must catch and buffer.
 */
async function logWebhookEvent(opts: {
  provider: string;
  eventType: string;
  eventId: string;
  reference: string | null;
  rawPayload: unknown;
}): Promise<{ isDuplicate: boolean }> {
  const sentinel = makeSentinel();

  try {
    // Sentinel written during INSERT — ownership established with no gap.
    await db.insert(webhookEventsTable).values({
      provider:     opts.provider,
      eventType:    opts.eventType,
      eventId:      opts.eventId,
      reference:    opts.reference,
      rawPayload:   opts.rawPayload as Record<string, unknown>,
      errorMessage: sentinel,
      // processedAt omitted — set only after business logic succeeds
    });
    return { isDuplicate: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;

    // SQLSTATE 23505 = unique_violation; message fallback for driver variants
    const isUniqueViolation =
      code === "23505" ||
      msg.includes("webhook_events_event_id_unique") ||
      msg.includes("unique constraint");

    if (!isUniqueViolation) {
      throw err; // genuine DB connectivity error — caller will buffer
    }

    // ── Unique constraint hit: event already exists ──
    //
    // Atomic compare-and-set claim: the UPDATE's WHERE clause atomically
    // checks all preconditions in a single SQL statement.  Two concurrent
    // retries both issue this UPDATE; the DB row-lock ensures only one gets
    // RETURNING rows > 0.  The other sees 0 rows → isDuplicate=true.
    //
    // Claimable when processedAt IS NULL (not yet processed) AND errorMessage
    // is either NULL (markWebhookFailed couldn't write during a DB outage) or
    // a real error string (not a live sentinel).  Both cases are retryable.
    //
    // We do NOT try to parse/compare sentinel timestamps in SQL to avoid
    // complex CAST/REGEX expressions.  Instead the background checker resets
    // timed-out sentinels to NULL, making this simple predicate sufficient.
    const claimed = await db
      .update(webhookEventsTable)
      .set({ errorMessage: sentinel })
      .where(
        sql`
          ${webhookEventsTable.eventId} = ${opts.eventId}
          AND ${webhookEventsTable.processedAt} IS NULL
          AND (
            ${webhookEventsTable.errorMessage} IS NULL
            OR ${webhookEventsTable.errorMessage} NOT LIKE '[in-progress:%'
          )
        `,
      )
      .returning({ id: webhookEventsTable.id });

    if (claimed.length === 0) {
      console.warn(`[webhook] duplicate or in-progress event — skipping — id=${opts.eventId}`);
      return { isDuplicate: true };
    }

    console.info(`[webhook] retrying unprocessed event (atomic claim) — id=${opts.eventId}`);
    return { isDuplicate: false };
  }
}

/** Mark a webhook event as successfully processed. Clears any in-progress sentinel. */
async function markWebhookProcessed(eventId: string): Promise<void> {
  await db
    .update(webhookEventsTable)
    .set({ processedAt: new Date(), errorMessage: null })
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

  await sendSlackAlert(
    `🚨 *Webhook processing failed*\n` +
    `• Provider: \`${provider}\`\n` +
    `• Event type: \`${eventType}\`\n` +
    `• Event ID: \`${eventId}\`\n` +
    `• Error: ${errorMessage}`,
  );
}

// ── Shared business logic (used by live webhooks and admin retry) ────────────

/** Applies the business-logic side effects for a Stripe event. Idempotent-ish: safe to re-run. */
async function processStripeEvent(event: Stripe.Event): Promise<void> {
  const session =
    event.type === "checkout.session.completed"
      ? (event.data.object as Stripe.Checkout.Session)
      : null;

  if (event.type === "checkout.session.completed" && session) {
    const upgradeVendorId = session.metadata?.upgradeVendorId
      ? parseInt(session.metadata.upgradeVendorId)
      : null;
    const upgradeTier = session.metadata?.upgradeTier ?? null;

    if (upgradeVendorId && upgradeTier) {
      // ── Subscription self-upgrade path ──────────────────────────────
      const VALID_UPGRADE_TIERS = ["starter", "pro", "enterprise"];
      if (VALID_UPGRADE_TIERS.includes(upgradeTier)) {
        const [updated] = await db
          .update(vendorsTable)
          .set({ subscriptionTier: upgradeTier, updatedAt: new Date() })
          .where(eq(vendorsTable.id, upgradeVendorId))
          .returning({ id: vendorsTable.id, subscriptionTier: vendorsTable.subscriptionTier });

        if (updated) {
          console.info(
            `[stripe webhook] subscription upgrade — vendor=${upgradeVendorId} tier=${upgradeTier} session=${session.id}`,
          );
        } else {
          console.warn(
            `[stripe webhook] subscription upgrade — vendor ${upgradeVendorId} not found for session=${session.id}`,
          );
        }
      } else {
        console.warn(
          `[stripe webhook] subscription upgrade — invalid tier '${upgradeTier}' in session=${session.id}`,
        );
      }
    } else {
      // ── Regular order checkout path ─────────────────────────────────
      const orderId = session.metadata?.orderId ? parseInt(session.metadata.orderId) : null;

      await db.update(paymentsTable)
        .set({ status: "paid", updatedAt: new Date() })
        .where(eq(paymentsTable.providerReference, session.id));

      if (orderId) {
        await db.update(ordersTable)
          .set({ paymentStatus: "paid", updatedAt: new Date() })
          .where(eq(ordersTable.id, orderId));
      }

      console.info(`[stripe webhook] checkout.session.completed — session=${session.id} order=${orderId}`);
    }

    console.info(`[stripe webhook] checkout.session.completed processed — session=${session.id}`);
  } else {
    console.info(`[stripe webhook] unhandled event type skipped — type=${event.type} id=${event.id}`);
  }
}

/** Applies the business-logic side effects for a Paystack event. Idempotent-ish: safe to re-run. */
async function processPaystackEvent(event: {
  event: string;
  data: { id?: number | string; reference: string; metadata?: { orderId?: string } };
}): Promise<void> {
  if (event.event === "charge.success") {
    const { reference, metadata } = event.data;
    const orderId = metadata?.orderId ? parseInt(metadata.orderId) : null;

    await db.update(paymentsTable)
      .set({ status: "paid", updatedAt: new Date() })
      .where(eq(paymentsTable.providerReference, reference));

    if (orderId) {
      await db.update(ordersTable)
        .set({ paymentStatus: "paid", updatedAt: new Date() })
        .where(eq(ordersTable.id, orderId));
    }

    console.info(`[paystack webhook] charge.success — reference=${reference} order=${orderId}`);
  } else {
    console.info(`[paystack webhook] unhandled event type skipped — type=${event.event} id=${event.data.id ?? event.data.reference}`);
  }
}

/**
 * Re-processes a stored webhook event's raw payload through the same business
 * logic used by the live webhook handlers. Used by the admin "Retry" action
 * for skipped/failed events. Does NOT re-verify provider signatures — the
 * payload was already verified and persisted at original delivery time.
 *
 * Throws if the event id is unknown or the event was already processed.
 * On success, sets processedAt. On failure, records the error and rethrows.
 */
export async function retryWebhookEventById(id: number): Promise<{ eventId: string }> {
  const [row] = await db.select().from(webhookEventsTable).where(eq(webhookEventsTable.id, id));
  if (!row) {
    throw Object.assign(new Error("Webhook event not found"), { statusCode: 404 });
  }
  if (row.processedAt) {
    throw Object.assign(new Error("Webhook event was already processed"), { statusCode: 409 });
  }

  try {
    if (row.provider === "stripe") {
      await processStripeEvent(row.rawPayload as unknown as Stripe.Event);
    } else if (row.provider === "paystack") {
      await processPaystackEvent(row.rawPayload as unknown as {
        event: string;
        data: { id?: number | string; reference: string; metadata?: { orderId?: string } };
      });
    } else {
      throw new Error(`Unknown provider '${row.provider}'`);
    }
    await markWebhookProcessed(row.eventId);
    console.info(`[webhook] admin retry succeeded — id=${row.id} eventId=${row.eventId}`);
  } catch (err) {
    await markWebhookFailed(row.eventId, row.provider, row.eventType, err).catch(() => {});
    console.error(`[webhook] admin retry failed — id=${row.id} eventId=${row.eventId}:`, err);
    throw Object.assign(new Error(err instanceof Error ? err.message : String(err)), { statusCode: 502 });
  }

  return { eventId: row.eventId };
}

// ── Stripe webhook ────────────────────────────────────────────────────────────

router.post("/payments/stripe/webhook", async (req, res): Promise<void> => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) { res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET not configured" }); return; }
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) { res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" }); return; }

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

  const session =
    event.type === "checkout.session.completed"
      ? (event.data.object as Stripe.Checkout.Session)
      : null;

  /**
   * Full pipeline: log → business logic → mark processed.
   *
   * Business-logic failures call markWebhookFailed before rethrowing so that
   * errorMessage is always set on failure — enabling the atomic claim path to
   * reclaim the row on the next retry (provider or buffer drainer).
   *
   * Stored as a closure so the buffer can replay it when the DB recovers.
   */
  async function fullPipeline(): Promise<void> {
    const { isDuplicate } = await logWebhookEvent({
      provider:   "stripe",
      eventType:  event.type,
      eventId:    event.id,
      reference:  session?.id ?? null,
      rawPayload: event,
    });

    if (isDuplicate) return;

    try {
      await processStripeEvent(event);
      await markWebhookProcessed(event.id);
    } catch (bizErr) {
      await markWebhookFailed(event.id, "stripe", event.type, bizErr).catch(() => {});
      throw bizErr;
    }
  }

  try {
    await fullPipeline();
    res.json({ received: true });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      enqueueWebhookEvent({ eventId: event.id, provider: "stripe", eventType: event.type, process: fullPipeline });
      console.warn(`[stripe webhook] DB unavailable — event ${event.id} buffered`);
      res.json({ received: true, buffered: true });
    } else {
      console.error(`[stripe webhook] Processing failed — event=${event.id}:`, err);
      res.status(500).json({ error: "Internal processing error — will retry" });
    }
  }
});

// ── Paystack webhook ──────────────────────────────────────────────────────────

router.post("/payments/paystack/webhook", async (req, res): Promise<void> => {
  const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET;
  if (!webhookSecret) { res.status(500).json({ error: "PAYSTACK_WEBHOOK_SECRET not configured" }); return; }

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

  const eventId = event.data.id
    ? `paystack-${event.data.id}`
    : `paystack-${event.event}-${event.data.reference}`;

  /** Same pipeline/safety model as the Stripe handler above. */
  async function fullPipeline(): Promise<void> {
    const { isDuplicate } = await logWebhookEvent({
      provider:   "paystack",
      eventType:  event.event,
      eventId,
      reference:  event.data.reference,
      rawPayload: event,
    });

    if (isDuplicate) return;

    try {
      await processPaystackEvent(event);
      await markWebhookProcessed(eventId);
    } catch (bizErr) {
      await markWebhookFailed(eventId, "paystack", event.event, bizErr).catch(() => {});
      throw bizErr;
    }
  }

  try {
    await fullPipeline();
    res.json({ received: true });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      enqueueWebhookEvent({ eventId, provider: "paystack", eventType: event.event, process: fullPipeline });
      console.warn(`[paystack webhook] DB unavailable — event ${eventId} buffered`);
      res.json({ received: true, buffered: true });
    } else {
      console.error(`[paystack webhook] Processing failed — event=${eventId}:`, err);
      res.status(500).json({ error: "Internal processing error — will retry" });
    }
  }
});

// ── Background checker: stale events + stale sentinel cleanup ─────────────────

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS   = 60 * 1000;      // 1 minute

const alertedEventIds = new Set<string>();

async function checkStaleWebhookEvents(): Promise<void> {
  try {
    // ── 1. Reset timed-out in-progress sentinels ──────────────────────────────
    // Fetch rows whose errorMessage is a sentinel (handler claimed but never
    // completed, likely due to a crash).  Reset them to NULL so the atomic
    // claim UPDATE in logWebhookEvent can reclaim them on the next delivery.
    const inProgressRows = await db
      .select({ eventId: webhookEventsTable.eventId, errorMessage: webhookEventsTable.errorMessage })
      .from(webhookEventsTable)
      .where(
        sql`${webhookEventsTable.processedAt} IS NULL AND ${webhookEventsTable.errorMessage} LIKE '[in-progress:%'`,
      );

    for (const row of inProgressRows) {
      if (row.errorMessage && isSentinel(row.errorMessage) && isSentinelTimedOut(row.errorMessage)) {
        // Compare-and-swap: only reset if errorMessage is STILL the exact
        // sentinel we read.  If another handler claimed the event between our
        // SELECT and this UPDATE (writing a fresh sentinel), the WHERE won't
        // match and we leave the new claim untouched.
        const result = await db
          .update(webhookEventsTable)
          .set({ errorMessage: null })
          .where(
            sql`${webhookEventsTable.eventId} = ${row.eventId} AND ${webhookEventsTable.errorMessage} = ${row.errorMessage}`,
          )
          .returning({ id: webhookEventsTable.id });
        if (result.length > 0) {
          console.warn(`[webhook] timed-out in-progress sentinel reset — id=${row.eventId}`);
        }
      }
    }

    // ── 2. Alert on stale failed events ──────────────────────────────────────
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

    const stale = await db
      .select({
        eventId:      webhookEventsTable.eventId,
        provider:     webhookEventsTable.provider,
        eventType:    webhookEventsTable.eventType,
        errorMessage: webhookEventsTable.errorMessage,
        receivedAt:   webhookEventsTable.receivedAt,
      })
      .from(webhookEventsTable)
      .where(
        sql`${webhookEventsTable.processedAt} IS NULL AND ${webhookEventsTable.errorMessage} IS NOT NULL AND ${webhookEventsTable.errorMessage} NOT LIKE '[in-progress:%' AND ${webhookEventsTable.receivedAt} < ${cutoff}`,
      );

    for (const row of stale) {
      if (alertedEventIds.has(row.eventId)) continue;

      await sendSlackAlert(
        `⏰ *Stale unprocessed webhook event* (>5 min)\n` +
        `• Provider: \`${row.provider}\`\n` +
        `• Event type: \`${row.eventType}\`\n` +
        `• Event ID: \`${row.eventId}\`\n` +
        `• Received: ${row.receivedAt.toISOString()}\n` +
        `• Error: ${row.errorMessage}`,
      );

      alertedEventIds.add(row.eventId);
    }
  } catch (err) {
    console.error("[webhook] Background checker failed:", err);
  }
}

setTimeout(() => {
  void checkStaleWebhookEvents();
  setInterval(() => void checkStaleWebhookEvents(), POLL_INTERVAL_MS);
}, 10_000);

export default router;
