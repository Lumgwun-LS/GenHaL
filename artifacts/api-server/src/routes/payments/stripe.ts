import { Router } from "express";
import Stripe from "stripe";
import { db, paymentsTable, ordersTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveStripeKey } from "../../lib/vendor-keys";

const router = Router();

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
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId ? parseInt(session.metadata.orderId) : null;
      const vendorId = session.metadata?.vendorId ? parseInt(session.metadata.vendorId) : null;

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

    res.json({ received: true });
  },
);

export default router;
