import { Router } from "express";
import crypto from "crypto";
import { db, paymentsTable, ordersTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const PAYSTACK_BASE = "https://api.paystack.co";

function getPaystackKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

/**
 * POST /payments/paystack/initialize
 * Initializes a Paystack transaction and returns the authorization URL.
 *
 * Body: { orderId, vendorId, amount, currency, email, callbackUrl }
 */
router.post("/payments/paystack/initialize", async (req, res): Promise<void> => {
  const {
    orderId,
    vendorId,
    amount,
    currency = "NGN",
    email,
    callbackUrl,
    description,
  } = req.body as {
    orderId?: number;
    vendorId: number;
    amount: number;
    currency?: string;
    email: string;
    callbackUrl?: string;
    description?: string;
  };

  if (!vendorId || !amount || !email) {
    res.status(400).json({ error: "vendorId, amount and email are required" });
    return;
  }

  // Verify vendor exists and has Paystack enabled
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (!vendor.paystackEnabled) { res.status(403).json({ error: "Paystack is not enabled for this vendor" }); return; }

  const secretKey = getPaystackKey();

  // Paystack amounts are in kobo (NGN) or lowest denomination
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

  // Record payment row as pending
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

    // req.body is raw Buffer when mounted before express.json()
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

      // Update payment row
      await db
        .update(paymentsTable)
        .set({ status: "paid", updatedAt: new Date() })
        .where(eq(paymentsTable.providerReference, reference));

      // Update order payment status
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
