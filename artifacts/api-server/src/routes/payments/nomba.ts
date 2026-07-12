import { Router } from "express";
import crypto from "crypto";
import { db, paymentsTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveGatewayField } from "../../lib/platform-gateways";

const router = Router();

const NOMBA_BASE = "https://api.nomba.com/v1";

async function getNombaCreds(): Promise<{ accountId: string; clientId: string; clientSecret: string } | null> {
  const [accountId, clientId, clientSecret] = await Promise.all([
    resolveGatewayField("nomba", "accountId"),
    resolveGatewayField("nomba", "clientId"),
    resolveGatewayField("nomba", "clientSecret"),
  ]);
  if (!accountId || !clientId || !clientSecret) return null;
  return { accountId, clientId, clientSecret };
}

/** Exchanges Nomba client credentials for a short-lived access token. */
async function issueNombaToken(creds: { accountId: string; clientId: string; clientSecret: string }): Promise<string> {
  const response = await fetch(`${NOMBA_BASE}/auth/token/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accountId: creds.accountId,
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });

  const data = (await response.json()) as {
    code?: string;
    data?: { access_token: string };
    description?: string;
    message?: string;
  };

  if (!response.ok || !data.data?.access_token) {
    throw new Error(data.description ?? data.message ?? `Nomba token issue failed (HTTP ${response.status})`);
  }
  return data.data.access_token;
}

/**
 * POST /payments/nomba/checkout
 * Creates a Nomba hosted checkout order and returns the checkout link.
 * Credentials come from the admin-configured platform gateway (DB), with an
 * env-var fallback — same resolution path used by refunds/webhooks.
 *
 * Body: { orderId, vendorId, amount, currency, email, callbackUrl }
 *
 * Webhook handling for Nomba lives in ./webhooks.ts, alongside the other
 * providers' DB-outage-resilient pipeline (buffering, dedup, retry).
 */
router.post("/payments/nomba/checkout", async (req, res): Promise<void> => {
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
    email?: string;
    callbackUrl: string;
    description?: string;
  };

  if (!vendorId || !amount || !callbackUrl) {
    res.status(400).json({ error: "vendorId, amount and callbackUrl are required" });
    return;
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (!vendor.nombaEnabled) {
    res.status(403).json({ error: "This vendor is not enabled for Nomba payments." });
    return;
  }

  const creds = await getNombaCreds();
  if (!creds) {
    res.status(503).json({ error: "Nomba is not configured. Add a platform Nomba key in Admin \u2192 Payment Gateways." });
    return;
  }

  let accessToken: string;
  try {
    accessToken = await issueNombaToken(creds);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Nomba auth failed: ${msg}` });
    return;
  }

  const orderReference = `nomba_${vendorId}_${orderId ?? "adhoc"}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  const response = await fetch(`${NOMBA_BASE}/checkout/order`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      accountId: creds.accountId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      order: {
        orderReference,
        callbackUrl,
        customerEmail: email,
        amount: amount.toString(),
        currency: currency.toUpperCase(),
        description: description ?? `Order #${orderId ?? ""}`,
      },
    }),
  });

  const data = (await response.json()) as {
    code?: string;
    data?: { checkoutLink: string; orderReference: string };
    description?: string;
    message?: string;
  };

  if (!response.ok || !data.data?.checkoutLink) {
    res.status(502).json({ error: `Nomba error: ${data.description ?? data.message ?? "checkout order failed"}` });
    return;
  }

  const [payment] = await db.insert(paymentsTable).values({
    orderId: orderId ?? null,
    vendorId,
    provider: "nomba",
    providerReference: orderReference,
    amount: amount.toString(),
    currency: currency.toUpperCase(),
    status: "pending",
    metadata: { orderReference, checkoutLink: data.data.checkoutLink },
  }).returning();

  res.json({ paymentId: payment!.id, reference: orderReference, url: data.data.checkoutLink });
});

export default router;
