import { Router } from "express";
import crypto from "crypto";
import { db, paymentsTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveGatewayField } from "../../lib/platform-gateways";

const router = Router();

const REMITA_BASE = "https://login.remita.net/remita/exapp/api/v1/send/api";

interface RemitaCreds {
  merchantId: string;
  apiKey: string;
  apiToken: string;
  serviceTypeId: string;
}

async function getRemitaCreds(): Promise<RemitaCreds | null> {
  const [merchantId, apiKey, apiToken, serviceTypeId] = await Promise.all([
    resolveGatewayField("remita", "merchantId"),
    resolveGatewayField("remita", "apiKey"),
    resolveGatewayField("remita", "apiToken"),
    resolveGatewayField("remita", "serviceTypeId"),
  ]);
  if (!merchantId || !apiKey || !apiToken || !serviceTypeId) return null;
  return { merchantId, apiKey, apiToken, serviceTypeId };
}

/** Remita's request hash: sha512(merchantId + serviceTypeId + orderId + amount + apiKey). */
function requestHash(creds: RemitaCreds, orderId: string, amount: string): string {
  return crypto
    .createHash("sha512")
    .update(`${creds.merchantId}${creds.serviceTypeId}${orderId}${amount}${creds.apiKey}`)
    .digest("hex");
}

/**
 * POST /payments/remita/checkout
 * Initializes a Remita RRR (Retrieval Reference Number) and returns the
 * hosted checkout URL vendors redirect customers to.
 * Credentials come from the admin-configured platform gateway (DB), with an
 * env-var fallback — same resolution path used by refunds/webhooks.
 *
 * Note: Remita does not send signed webhooks, so payment confirmation is
 * done by the admin "retry"/reconciliation query-back flow in ./webhooks.ts
 * rather than trusting an inbound payload — see that file's Remita handler.
 *
 * Body: { orderId, vendorId, amount, currency, payerName, payerEmail, payerPhone }
 */
router.post("/payments/remita/checkout", async (req, res): Promise<void> => {
  const {
    orderId,
    vendorId,
    amount,
    currency = "NGN",
    payerName,
    payerEmail,
    payerPhone,
    description,
  } = req.body as {
    orderId?: number;
    vendorId: number;
    amount: number;
    currency?: string;
    payerName: string;
    payerEmail: string;
    payerPhone?: string;
    description?: string;
  };

  if (!vendorId || !amount || !payerName || !payerEmail) {
    res.status(400).json({ error: "vendorId, amount, payerName and payerEmail are required" });
    return;
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (!vendor.remitaEnabled) {
    res.status(403).json({ error: "This vendor is not enabled for Remita payments." });
    return;
  }

  const creds = await getRemitaCreds();
  if (!creds) {
    res.status(503).json({ error: "Remita is not configured. Add a platform Remita key in Admin \u2192 Payment Gateways." });
    return;
  }

  // orderId sent to Remita must be unique per attempt
  const remitaOrderId = `remita_${vendorId}_${orderId ?? "adhoc"}_${Date.now()}`;
  const amountStr = amount.toFixed(2);
  const hash = requestHash(creds, remitaOrderId, amountStr);

  const response = await fetch(`${REMITA_BASE}/echannelsvc/merchant/api/paymentinit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `remitaConsumerKey=${creds.merchantId}, remitaConsumerToken=${hash}`,
    },
    body: JSON.stringify({
      serviceTypeId: creds.serviceTypeId,
      amount: amountStr,
      orderId: remitaOrderId,
      payerName,
      payerEmail,
      payerPhone: payerPhone ?? "",
      description: description ?? `Order #${orderId ?? ""}`,
      currency: currency.toUpperCase(),
    }),
  });

  const data = (await response.json().catch(() => ({}))) as {
    statuscode?: string;
    status?: string;
    RRR?: string;
    responseMsg?: string;
    message?: string;
  };

  // Remita's success statuscode is "025"
  if (data.statuscode !== "025" || !data.RRR) {
    res.status(502).json({ error: `Remita error: ${data.responseMsg ?? data.message ?? "payment init failed"}` });
    return;
  }

  const checkoutUrl = `https://login.remita.net/payment/v1/remita/ecomm/${creds.merchantId}/${data.RRR}/${hash}`;

  const [payment] = await db.insert(paymentsTable).values({
    orderId: orderId ?? null,
    vendorId,
    provider: "remita",
    providerReference: data.RRR,
    amount: amountStr,
    currency: currency.toUpperCase(),
    status: "pending",
    metadata: { rrr: data.RRR, remitaOrderId, checkoutUrl },
  }).returning();

  res.json({ paymentId: payment!.id, reference: data.RRR, url: checkoutUrl });
});

export default router;
