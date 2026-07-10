import { Router } from "express";
import Stripe from "stripe";
import { db, paymentsTable, ordersTable, vendorsTable, webhookEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveStripeKey } from "../../lib/vendor-keys";
import { applyVendorTierUpgrade } from "../../lib/subscription-sync";

const router = Router();

/**
 * Claims a Stripe event id for processing, using the same globally unique
 * `webhookEventsTable.eventId` column the centralized webhook pipeline
 * (payments/webhooks.ts) writes to.
 *
 * - First delivery: inserts a row with `processedAt` left NULL (not yet
 *   applied) and returns "claimed" — caller should run side effects, then
 *   call `markStripeEventProcessed`.
 * - Retry after a prior delivery finished successfully (`processedAt` set):
 *   returns "duplicate" — caller must NOT re-run side effects.
 * - Retry after a prior delivery failed or crashed mid-run (`processedAt`
 *   still NULL): returns "claimed" again so the retry can complete the work
 *   Stripe expects — this preserves Stripe's retry semantics instead of
 *   silently swallowing the event.
 */
async function claimStripeEvent(eventId: string, eventType: string): Promise<"claimed" | "duplicate"> {
  try {
    await db.insert(webhookEventsTable).values({
      provider: "stripe",
      eventType,
      eventId,
      reference: null,
      rawPayload: {},
      // processedAt intentionally omitted — only set after side effects succeed
    });
    return "claimed"; // first time we've seen this event id
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    const msg = err instanceof Error ? err.message : String(err);
    const isUniqueViolation =
      code === "23505" || msg.includes("webhook_events_event_id_unique") || msg.includes("unique constraint");
    if (!isUniqueViolation) throw err;

    const [existing] = await db
      .select({ processedAt: webhookEventsTable.processedAt })
      .from(webhookEventsTable)
      .where(eq(webhookEventsTable.eventId, eventId));

    if (existing?.processedAt) return "duplicate"; // already finished successfully
    return "claimed"; // never finished — safe/necessary to retry
  }
}

/** Marks a Stripe event id as successfully processed so future deliveries are treated as duplicates. */
async function markStripeEventProcessed(eventId: string): Promise<void> {
  await db
    .update(webhookEventsTable)
    .set({ processedAt: new Date() })
    .where(eq(webhookEventsTable.eventId, eventId));
}

/**
 * POST /payments/stripe/checkout
 * Creates a Stripe Checkout Session and returns the hosted URL.
 * Uses the vendor's own Stripe key if configured and tier-eligible;
 * falls back to the platform key otherwise.
 *
 * Body: { orderId, vendorId, amount, currency, customerEmail, successUrl, cancelUrl }
 */
router.post("/payments/stripe/checkout", async (req, res): Promise<void> => {
  const {
    orderId,
    vendorId,
    amount,
    currency = "usd",
    customerEmail,
    successUrl,
    cancelUrl,
    description,
  } = req.body as {
    orderId?: number;
    vendorId: number;
    amount: number;
    currency?: string;
    customerEmail?: string;
    successUrl: string;
    cancelUrl: string;
    description?: string;
  };

  if (!vendorId || !amount || !successUrl || !cancelUrl) {
    res.status(400).json({ error: "vendorId, amount, successUrl and cancelUrl are required" });
    return;
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (!vendor.stripeEnabled) { res.status(403).json({ error: "Stripe is not enabled for this vendor" }); return; }

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
    customer_email: customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: Math.round(amount * 100),
          product_data: {
            name: description ?? `Order #${orderId ?? ""}`,
          },
        },
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      orderId: orderId?.toString() ?? "",
      vendorId: vendorId.toString(),
    },
  });

  const [payment] = await db.insert(paymentsTable).values({
    orderId: orderId ?? null,
    vendorId,
    provider: "stripe",
    providerReference: session.id,
    amount: amount.toString(),
    currency: currency.toUpperCase(),
    status: "pending",
    metadata: { sessionId: session.id, sessionUrl: session.url },
  }).returning();

  res.json({ paymentId: payment!.id, sessionId: session.id, url: session.url });
});

/**
 * POST /payments/stripe/webhook
 * Stripe sends events here. Must be registered in the Stripe dashboard.
 * Uses raw body for signature verification — mounted BEFORE express.json().
 */
router.post(
  "/payments/stripe/webhook",
  async (req, res): Promise<void> => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET not configured" });
      return;
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) { res.status(400).json({ error: "Missing stripe-signature header" }); return; }

    let event: Stripe.Event;
    try {
      // Use the platform webhook secret — vendor-specific webhooks are future work
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: `Webhook signature verification failed: ${msg}` });
      return;
    }

    if (event.type === "checkout.session.completed") {
      // Idempotency guard: Stripe retries webhook delivery on non-2xx/timeout,
      // so the same event id can arrive more than once. Claim it before
      // running any side effects (tier upgrades, payment/order updates); a
      // delivery that already finished successfully is a safe no-op instead
      // of re-applying them. A delivery that failed mid-run (processedAt
      // never got set) is re-claimed so Stripe's retry can still complete it.
      const claim = await claimStripeEvent(event.id, event.type);
      if (claim === "duplicate") {
        console.info(`[stripe webhook] duplicate delivery — skipping already-processed event=${event.id}`);
        res.json({ received: true });
        return;
      }

      try {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId ? parseInt(session.metadata.orderId) : null;
        const vendorId = session.metadata?.vendorId ? parseInt(session.metadata.vendorId) : null;

        // ── Subscription upgrade path ────────────────────────────────────────
        const upgradeVendorId = session.metadata?.upgradeVendorId
          ? parseInt(session.metadata.upgradeVendorId)
          : null;
        const upgradeTier = session.metadata?.upgradeTier ?? null;

        if (upgradeVendorId && upgradeTier) {
          const subscriptionId =
            typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);
          const result = await applyVendorTierUpgrade(upgradeVendorId, upgradeTier, subscriptionId, "webhook");
          if (!result.applied) {
            console.warn(`[stripe webhook] subscription upgrade skipped — vendor=${upgradeVendorId} reason=${result.reason} session=${session.id}`);
          }
          // Subscription upgrades don't have a paymentsTable row — skip order/payment updates.
        } else {
          // ── Regular order checkout path ────────────────────────────────────
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

          console.info(`[stripe webhook] checkout.session.completed — session=${session.id} order=${orderId} vendor=${vendorId}`);
        }
      } catch (bizErr) {
        // Leave processedAt NULL so a Stripe retry of this same event id can
        // reclaim and complete the work — do not swallow the failure as 200.
        console.error(`[stripe webhook] processing failed — event=${event.id}:`, bizErr);
        res.status(500).json({ error: "Internal processing error — will retry" });
        return;
      }

      await markStripeEventProcessed(event.id);
    }

    res.json({ received: true });
  },
);

export default router;
