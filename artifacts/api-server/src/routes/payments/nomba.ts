import { Router } from "express";
import crypto from "crypto";
import { db, paymentsTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveGatewayField } from "../../lib/platform-gateways";

const router = Router();

export const NOMBA_BASE = "https://api.nomba.com/v1";

export async function getNombaCreds(): Promise<{ accountId: string; clientId: string; clientSecret: string } | null> {
  const [accountId, clientId, clientSecret] = await Promise.all([
    resolveGatewayField("nomba", "accountId"),
    resolveGatewayField("nomba", "clientId"),
    resolveGatewayField("nomba", "clientSecret"),
  ]);
  if (!accountId || !clientId || !clientSecret) return null;
  return { accountId, clientId, clientSecret };
}

/** Exchanges Nomba client credentials for a short-lived access token. */
export async function issueNombaToken(creds: { accountId: string; clientId: string; clientSecret: string }): Promise<string> {
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

export interface NombaCheckoutInput {
  orderId?: number | null;
  vendorId: number;
  amount: number;
  currency?: string;
  email?: string;
  callbackUrl: string;
  description?: string;
}

export type NombaCheckoutResult =
  | { ok: true; paymentId: number; reference: string; url: string }
  | { ok: false; status: number; error: string };

/**
 * Shared Nomba checkout-initiation logic, used by both the direct
 * POST /payments/nomba/checkout route and the customer-facing shop-link
 * checkout in routes/public-post-links.ts.
 *
 * Webhook handling for Nomba lives in ./webhooks.ts, alongside the other
 * providers' DB-outage-resilient pipeline (buffering, dedup, retry).
 */
export async function createNombaCheckout(input: NombaCheckoutInput): Promise<NombaCheckoutResult> {
  const { orderId, vendorId, amount, currency = "NGN", email, callbackUrl, description } = input;

  if (!vendorId || !amount || !callbackUrl) {
    return { ok: false, status: 400, error: "vendorId, amount and callbackUrl are required" };
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) return { ok: false, status: 404, error: "Vendor not found" };
  if (!vendor.nombaEnabled) {
    return { ok: false, status: 403, error: "This vendor is not enabled for Nomba payments." };
  }

  const creds = await getNombaCreds();
  if (!creds) {
    return { ok: false, status: 503, error: "Nomba is not configured. Add a platform Nomba key in Admin \u2192 Payment Gateways." };
  }

  let accessToken: string;
  try {
    accessToken = await issueNombaToken(creds);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, error: `Nomba auth failed: ${msg}` };
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
    return { ok: false, status: 502, error: `Nomba error: ${data.description ?? data.message ?? "checkout order failed"}` };
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

  return { ok: true, paymentId: payment!.id, reference: orderReference, url: data.data.checkoutLink };
}

/**
 * POST /payments/nomba/checkout
 * Creates a Nomba hosted checkout order and returns the checkout link.
 * Credentials come from the admin-configured platform gateway (DB), with an
 * env-var fallback — same resolution path used by refunds/webhooks.
 *
 * Body: { orderId, vendorId, amount, currency, email, callbackUrl }
 */
router.post("/payments/nomba/checkout", async (req, res): Promise<void> => {
  const result = await createNombaCheckout(req.body ?? {});
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  res.json({ paymentId: result.paymentId, reference: result.reference, url: result.url });
});

export default router;
