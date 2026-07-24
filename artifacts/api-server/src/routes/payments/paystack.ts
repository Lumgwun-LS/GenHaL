import { Router } from "express";
import { getAuth } from "@clerk/express";
import crypto from "crypto";
import { db, paymentsTable, ordersTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolvePaystackKey } from "../../lib/vendor-keys";
import { findActivePendingPayment } from "../../lib/payment-guard";

const router = Router();

const PAYSTACK_BASE = "https://api.paystack.co";

/**
 * POST /payments/paystack/initialize
 * Initializes a Paystack transaction and returns the authorization URL.
 * Uses the vendor's own Paystack key if configured and tier-eligible;
 * falls back to the platform key otherwise.
 *
 * Body: { orderId, vendorId, amount, currency, email, callbackUrl }
 */
router.post("/payments/paystack/initialize", async (req, res): Promise<void> => {
  // Require Clerk auth — vendor-initiated checkout only.
  // Public customer-side Paystack flows go through public-post-links.ts chargeProvider().
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);

  const [authedVendor] = await db.select({ id: vendorsTable.id })
    .from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  if (!authedVendor && !isAdmin) {
    res.status(403).json({ error: "No vendor account associated with this user" });
    return;
  }

  const {
    orderId,
    vendorId: bodyVendorId,
    amount: bodyAmount,
    currency = "NGN",
    email,
    callbackUrl,
    description,
  } = req.body as {
    orderId?: number;
    vendorId?: number;
    amount: number;
    currency?: string;
    email: string;
    callbackUrl?: string;
    description?: string;
  };

  // Non-admins always use their own vendorId — ignore any vendorId in the body.
  const vendorId: number = isAdmin ? (bodyVendorId ?? authedVendor!.id) : authedVendor!.id;

  // If tied to an order, verify ownership and use the DB-authoritative amount.
  let amount = bodyAmount;
  if (orderId) {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    if (!isAdmin && order.vendorId !== vendorId) {
      res.status(403).json({ error: "You do not have permission to pay for this order" });
      return;
    }
    if (order.status !== "pending") {
      res.status(409).json({ error: "This order is no longer available for payment." });
      return;
    }
    amount = parseFloat(order.totalAmount);
  }

  if (!amount || !email) {
    res.status(400).json({ error: "amount and email are required" });
    return;
  }

  // Guard: if this order already has a recent pending payment, return it
  // immediately instead of creating a duplicate checkout session.
  if (orderId) {
    const existing = await findActivePendingPayment(orderId);
    if (existing?.checkoutUrl) {
      res.json({ paymentId: existing.id, reference: existing.providerReference, url: existing.checkoutUrl });
      return;
    }
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (!vendor.paystackEnabled) { res.status(403).json({ error: "Paystack is not enabled for this vendor" }); return; }

  let secretKey: string;
  try {
    secretKey = await resolvePaystackKey(vendorId, vendor);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: msg });
    return;
  }

  const amountInKobo = Math.round(amount * 100);

  const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: amountInKobo,
      currency: currency.toUpperCase(),
      callback_url: callbackUrl,
      metadata: {
        orderId: orderId?.toString() ?? "",
        vendorId: vendorId.toString(),
        description: description ?? `Order #${orderId ?? ""}`,
      },
    }),
  });

  const data = (await response.json()) as {
    status: boolean;
    message: string;
    data?: { authorization_url: string; access_code: string; reference: string };
  };

  if (!data.status || !data.data) {
    res.status(502).json({ error: `Paystack error: ${data.message}` });
    return;
  }

  const { authorization_url, reference } = data.data;

  const [payment] = await db.insert(paymentsTable).values({
    orderId: orderId ?? null,
    vendorId,
    provider: "paystack",
    providerReference: reference,
    amount: amount.toString(),
    currency: currency.toUpperCase(),
    status: "pending",
    metadata: { reference, authorization_url },
  }).returning();

  res.json({ paymentId: payment!.id, reference, url: authorization_url });
});

/**
 * POST /payments/paystack/webhook
 * Paystack sends events here. Verify HMAC-SHA512 signature before acting.
 */
router.post(
  "/payments/paystack/webhook",
  async (req, res): Promise<void> => {
    const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(500).json({ error: "PAYSTACK_WEBHOOK_SECRET not configured" });
      return;
    }

    const rawBody = req.body as Buffer;
    const hash = crypto
      .createHmac("sha512", webhookSecret)
      .update(rawBody)
      .digest("hex");

    const incomingHash = req.headers["x-paystack-signature"] as string;
    if (!incomingHash || hash !== incomingHash) {
      res.status(400).json({ error: "Invalid Paystack webhook signature" });
      return;
    }

    const event = JSON.parse(rawBody.toString()) as {
      event: string;
      data: { reference: string; status: string; metadata?: { orderId?: string; vendorId?: string } };
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
  },
);

export default router;
