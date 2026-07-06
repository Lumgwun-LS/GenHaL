import { Router } from "express";
import Stripe from "stripe";
import { db, paymentsTable, ordersTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key);
}

/**
 * POST /payments/stripe/checkout
 * Creates a Stripe Checkout Session and returns the hosted URL.
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

  // Verify vendor exists and has Stripe enabled
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (!vendor.stripeEnabled) { res.status(403).json({ error: "Stripe is not enabled for this vendor" }); return; }

  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: Math.round(amount * 100), // cents
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

  // Record payment row as pending
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
  // Raw body is required for signature verification.
  // The app mounts this route before express.json() using the rawBody middleware.
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
      const stripe = getStripeClient();
      // req.body is raw Buffer when this route is mounted before express.json()
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
    } catch (err: any) {
      res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId ? parseInt(session.metadata.orderId) : null;
      const vendorId = session.metadata?.vendorId ? parseInt(session.metadata.vendorId) : null;

      // Update payment row
      await db
        .update(paymentsTable)
        .set({ status: "paid", updatedAt: new Date() })
        .where(eq(paymentsTable.providerReference, session.id));

      // Update order payment status
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
