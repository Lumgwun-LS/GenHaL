import { Router } from "express";
import crypto from "crypto";
import { db, paymentsTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveGatewayField } from "../../lib/platform-gateways";

const router = Router();

export const FLUTTERWAVE_BASE = "https://api.flutterwave.com/v3";

export interface FlutterwaveCheckoutInput {
  orderId?: number | null;
  vendorId: number;
  amount: number;
  currency?: string;
  email: string;
  redirectUrl: string;
  description?: string;
}

export type FlutterwaveCheckoutResult =
  | { ok: true; paymentId: number; reference: string; url: string }
  | { ok: false; status: number; error: string };

/**
 * Shared Flutterwave checkout-initiation logic, used by both the direct
 * POST /payments/flutterwave/checkout route and the customer-facing
 * shop-link checkout in routes/public-post-links.ts.
 *
 * Webhook handling for Flutterwave lives in ./webhooks.ts, alongside the
 * other providers' DB-outage-resilient pipeline (buffering, dedup, retry).
 */
export async function createFlutterwaveCheckout(input: FlutterwaveCheckoutInput): Promise<FlutterwaveCheckoutResult> {
  const { orderId, vendorId, amount, currency = "NGN", email, redirectUrl, description } = input;

  if (!vendorId || !amount || !email || !redirectUrl) {
    return { ok: false, status: 400, error: "vendorId, amount, email and redirectUrl are required" };
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) return { ok: false, status: 404, error: "Vendor not found" };
  if (!vendor.flutterwaveEnabled) {
    return { ok: false, status: 403, error: "This vendor is not enabled for Flutterwave payments." };
  }

  const secretKey = await resolveGatewayField("flutterwave", "secretKey");
  if (!secretKey) {
    return { ok: false, status: 503, error: "Flutterwave is not configured. Add a platform Flutterwave key in Admin \u2192 Payment Gateways." };
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
    return { ok: false, status: 502, error: `Flutterwave error: ${data.message}` };
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

  return { ok: true, paymentId: payment!.id, reference: txRef, url: data.data.link };
}

/**
 * POST /payments/flutterwave/checkout
 * Creates a Flutterwave Standard payment link and returns it.
 * Credentials come from the admin-configured platform gateway (DB), with an
 * env-var fallback — same resolution path used by refunds/webhooks.
 *
 * Body: { orderId, vendorId, amount, currency, email, redirectUrl }
 */
router.post("/payments/flutterwave/checkout", async (req, res): Promise<void> => {
  const result = await createFlutterwaveCheckout(req.body ?? {});
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  res.json({ paymentId: result.paymentId, reference: result.reference, url: result.url });
});

export default router;
