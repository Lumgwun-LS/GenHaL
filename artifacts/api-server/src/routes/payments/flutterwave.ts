import { Router } from "express";
import crypto from "crypto";
import { db, paymentsTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveGatewayField } from "../../lib/platform-gateways";

const router = Router();

export const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";

/**
 * POST /payments/flutterwave/checkout
 * Creates a Flutterwave Standard payment link and returns it.
 * Credentials come from the admin-configured platform gateway (DB), with an
 * env-var fallback — same resolution path used by refunds/webhooks.
 *
 * Body: { orderId, vendorId, amount, currency, email, redirectUrl }
 *
 * Webhook handling for Flutterwave lives in ./webhooks.ts, alongside the
 * other providers' DB-outage-resilient pipeline (buffering, dedup, retry).
 */
router.post("/payments/flutterwave/checkout", async (req, res): Promise<void> => {
  const {
    orderId,
    vendorId,
    amount,
    currency = "NGN",
    email,
    redirectUrl,
    description,
  } = req.body as {
    orderId?: number;
    vendorId: number;
    amount: number;
    currency?: string;
    email: string;
    redirectUrl: string;
    description?: string;
  };

  if (!vendorId || !amount || !email || !redirectUrl) {
    res.status(400).json({ error: "vendorId, amount, email and redirectUrl are required" });
    return;
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (!vendor.flutterwaveEnabled) {
    res.status(403).json({ error: "This vendor is not enabled for Flutterwave payments." });
    return;
  }

  const secretKey = await resolveGatewayField("flutterwave", "secretKey");
  if (!secretKey) {
    res.status(503).json({ error: "Flutterwave is not configured. Add a platform Flutterwave key in Admin \u2192 Payment Gateways." });
    return;
  }

  // tx_ref must be unique per transaction — Flutterwave uses it as their reference
  const txRef = `fw_${vendorId}_${orderId ?? "adhoc"}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  const response = await fetch(`${FLUTTERWAVE_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tx_ref: txRef,
      amount,
      currency: currency.toUpperCase(),
      redirect_url: redirectUrl,
      customer: { email },
      customizations: { title: description ?? `Order #${orderId ?? ""}` },
      meta: {
        orderId: orderId?.toString() ?? "",
        vendorId: vendorId.toString(),
      },
    }),
  });

  const data = (await response.json()) as {
    status: string;
    message: string;
    data?: { link: string };
  };

  if (data.status !== "success" || !data.data?.link) {
    res.status(502).json({ error: `Flutterwave error: ${data.message}` });
    return;
  }

  const [payment] = await db.insert(paymentsTable).values({
    orderId: orderId ?? null,
    vendorId,
    provider: "flutterwave",
    providerReference: txRef,
    amount: amount.toString(),
    currency: currency.toUpperCase(),
    status: "pending",
    metadata: { txRef, link: data.data.link },
  }).returning();

  res.json({ paymentId: payment!.id, reference: txRef, url: data.data.link });
});

export default router;
