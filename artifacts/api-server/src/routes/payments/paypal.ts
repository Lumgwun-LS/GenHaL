import { Router } from "express";
import { db, paymentsTable, ordersTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getPlatformCredentials, resolveGatewayField } from "../../lib/platform-gateways";
import { getPayPalAccessToken, paypalBaseUrl } from "../../lib/paypal-catalog";

const router = Router();

/**
 * POST /payments/paypal/checkout
 * Creates a PayPal Order and returns the approval URL so the customer can pay.
 *
 * Uses PayPal Orders API v2 (intent=CAPTURE). After customer approval, the
 * frontend calls POST /payments/paypal/capture with the token (Order ID) to
 * capture and finalise the payment. Alternatively the webhook
 * PAYMENT.CAPTURE.COMPLETED fires once capture succeeds.
 *
 * Body: { orderId?, vendorId, amount, currency, returnUrl, cancelUrl, description? }
 */
router.post("/payments/paypal/checkout", async (req, res): Promise<void> => {
  const {
    orderId,
    vendorId,
    amount,
    currency = "USD",
    returnUrl,
    cancelUrl,
    description,
  } = req.body as {
    orderId?: number;
    vendorId: number;
    amount: number;
    currency?: string;
    returnUrl: string;
    cancelUrl: string;
    description?: string;
  };

  if (!vendorId || !amount || !returnUrl || !cancelUrl) {
    res.status(400).json({ error: "vendorId, amount, returnUrl and cancelUrl are required" });
    return;
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  if (!vendor.paypalEnabled) { res.status(403).json({ error: "PayPal is not enabled for this vendor" }); return; }

  const creds = await getPlatformCredentials("paypal");
  if (!creds?.clientId || !creds?.clientSecret) {
    res.status(503).json({ error: "PayPal is not configured. Add platform PayPal credentials in Admin → Payment Gateways." });
    return;
  }

  const mode = creds.mode ?? "live";
  const base = paypalBaseUrl(mode);

  let token: string;
  try {
    token = await getPayPalAccessToken(creds.clientId, creds.clientSecret, mode);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: `PayPal auth failed: ${msg}` });
    return;
  }

  const customId = JSON.stringify({
    orderId: orderId ?? null,
    vendorId,
    description: description ?? `Order #${orderId ?? ""}`,
  });

  const orderPayload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: currency.toUpperCase(),
          value: amount.toFixed(2),
        },
        description: description ?? `Order #${orderId ?? ""}`,
        custom_id: customId,
      },
    ],
    application_context: {
      brand_name: "VendorHub",
      return_url: returnUrl,
      cancel_url: cancelUrl,
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
    },
  };

  const response = await fetch(`${base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `vendorhub-order-${vendorId}-${Date.now()}`,
    },
    body: JSON.stringify(orderPayload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "(no body)");
    res.status(502).json({ error: `PayPal create order failed (${response.status}): ${text}` });
    return;
  }

  const data = (await response.json()) as {
    id: string;
    links?: Array<{ rel: string; href: string }>;
  };

  const approvalUrl = data.links?.find((l) => l.rel === "approve")?.href;
  if (!approvalUrl) {
    res.status(502).json({ error: "PayPal order created but no approval URL in response" });
    return;
  }

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      orderId: orderId ?? null,
      vendorId,
      provider: "paypal",
      providerReference: data.id, // PayPal Order ID
      amount: amount.toString(),
      currency: currency.toUpperCase(),
      status: "pending",
      metadata: { paypalOrderId: data.id, approvalUrl },
    })
    .returning();

  res.json({ paymentId: payment!.id, paypalOrderId: data.id, url: approvalUrl });
});

/**
 * POST /payments/paypal/capture
 * Captures an approved PayPal order (called by the frontend after PayPal redirects back).
 * The `token` query param is the PayPal Order ID (appended automatically by PayPal to returnUrl).
 *
 * Body: { paypalOrderId } OR query: { token }
 *
 * On success, marks the local payment row as "paid" immediately (before the webhook arrives).
 * The webhook PAYMENT.CAPTURE.COMPLETED will be a no-op duplicate once the DB row
 * is already "paid" (applyPaymentStatusTransition is idempotent for paid→paid).
 */
router.post("/payments/paypal/capture", async (req, res): Promise<void> => {
  const paypalOrderId =
    (req.body as { paypalOrderId?: string }).paypalOrderId ??
    (req.query.token as string | undefined);

  if (!paypalOrderId) {
    res.status(400).json({ error: "paypalOrderId is required" });
    return;
  }

  // Look up the pending payment row
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.providerReference, paypalOrderId));

  if (!payment) {
    res.status(404).json({ error: "No pending PayPal payment found for this order ID" });
    return;
  }
  if (payment.status === "paid") {
    res.json({ success: true, paymentId: payment.id, status: "paid" });
    return;
  }
  if (payment.status === "cancelled") {
    res.status(409).json({ error: "This payment was cancelled and cannot be captured" });
    return;
  }

  const creds = await getPlatformCredentials("paypal");
  const captureClientId = creds?.clientId || process.env.PAYPAL_CLIENT_ID;
  const captureClientSecret = creds?.clientSecret || process.env.PAYPAL_CLIENT_SECRET;
  if (!captureClientId || !captureClientSecret) {
    res.status(503).json({ error: "PayPal is not configured. Add platform PayPal credentials in Admin → Payment Gateways." });
    return;
  }

  const mode = creds?.mode ?? "live";
  const base = paypalBaseUrl(mode);

  let token: string;
  try {
    token = await getPayPalAccessToken(captureClientId, captureClientSecret, mode);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: `PayPal auth failed: ${msg}` });
    return;
  }

  const captureRes = await fetch(`${base}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `vendorhub-capture-${paypalOrderId}`,
    },
    body: JSON.stringify({}),
  });

  if (!captureRes.ok) {
    const text = await captureRes.text().catch(() => "(no body)");
    res.status(502).json({ error: `PayPal capture failed (${captureRes.status}): ${text}` });
    return;
  }

  const captureData = (await captureRes.json()) as {
    status: string;
    purchase_units?: Array<{
      payments?: { captures?: Array<{ id: string; status: string }> };
    }>;
  };

  const captureStatus = captureData.purchase_units?.[0]?.payments?.captures?.[0]?.status;
  if (captureData.status !== "COMPLETED" && captureStatus !== "COMPLETED") {
    res.status(502).json({ error: `PayPal capture status is ${captureData.status ?? captureStatus ?? "unknown"}` });
    return;
  }

  // Mark payment as paid
  const [updated] = await db
    .update(paymentsTable)
    .set({ status: "paid", updatedAt: new Date() })
    .where(eq(paymentsTable.providerReference, paypalOrderId))
    .returning({ id: paymentsTable.id, vendorId: paymentsTable.vendorId, orderId: paymentsTable.orderId, amount: paymentsTable.amount, currency: paymentsTable.currency });

  if (updated?.orderId) {
    await db
      .update(ordersTable)
      .set({ paymentStatus: "paid", updatedAt: new Date() })
      .where(eq(ordersTable.id, updated.orderId));
  }

  // Sales sync
  if (updated) {
    const { syncSaleFromPayment } = await import("../../lib/sales-sync");
    await syncSaleFromPayment({
      id: payment.id,
      vendorId: updated.vendorId,
      amount: updated.amount,
      currency: updated.currency,
    });
  }

  console.info(`[paypal capture] COMPLETED — paypalOrderId=${paypalOrderId} paymentId=${payment.id}`);
  res.json({ success: true, paymentId: payment.id, status: "paid" });
});

export default router;
