import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, paymentsTable, ordersTable, orderItemsTable, productsTable, webhookEventsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { sendEmail } from "../../lib/mailer";
import { wrapVendorEmail, escapeHtml } from "../../lib/email-branding";
import stripeRouter from "./stripe";
import paystackRouter from "./paystack";
import paypalRouter from "./paypal";
import flutterwaveRouter, { FLUTTERWAVE_BASE } from "./flutterwave";
import nombaRouter, { NOMBA_BASE, getNombaCreds, issueNombaToken } from "./nomba";
import remitaRouter from "./remita";
import squadRouter from "./squad";
import interswitchRouter from "./interswitch";
import nowpaymentsRouter from "./nowpayments";
import stripeConnectRouter from "./stripe-connect";
import { retryWebhookEventById } from "./webhooks";
import { resolveGatewayField, callWithPlatformStripe, getPlatformCredentials } from "../../lib/platform-gateways";
import { notifyVendorPaymentStatus } from "../../lib/push";
import { notifyCustomerRefund } from "../../lib/customer-refund-notify";

const PAYSTACK_BASE = "https://api.paystack.co";

/** Returns true if the calling Clerk user is listed in ADMIN_USER_IDS env var. */
function isAdmin(userId: string): boolean {
  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

const router = Router();

// Mount sub-routers
router.use(stripeRouter);
router.use(paystackRouter);
router.use(paypalRouter);
router.use(flutterwaveRouter);
router.use(nombaRouter);
router.use(remitaRouter);
router.use(squadRouter);
router.use(interswitchRouter);
router.use(nowpaymentsRouter);
router.use(stripeConnectRouter);

/**
 * POST /payments/:id/refund
 * Initiates a full refund for a paid payment via the original gateway.
 */
router.post("/payments/:id/refund", async (req, res): Promise<void> => {
  const paymentId = parseInt(req.params.id);
  if (isNaN(paymentId)) {
    res.status(400).json({ error: "Invalid payment id" });
    return;
  }

  // Optional partial refund amount (in the payment's original currency, e.g. 25.00)
  const partialAmount: number | undefined =
    req.body.amount != null && !isNaN(parseFloat(req.body.amount))
      ? parseFloat(req.body.amount)
      : undefined;

  try {

  // Atomic claim: flip status to "refunding" only if currently "paid".
  // This prevents two concurrent refund requests from both reaching the gateway.
  const claimed = await db
    .update(paymentsTable)
    .set({ status: "refunding" as string, updatedAt: new Date() })
    .where(and(eq(paymentsTable.id, paymentId), sql`${paymentsTable.status} = 'paid'`))
    .returning();

  if (claimed.length === 0) {
    // Either not found or not in a refundable state — fetch to give a precise error.
    const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId));
    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
    } else {
      res.status(409).json({ error: `Cannot refund a payment with status '${payment.status}'` });
    }
    return;
  }

  const payment = claimed[0];

  // Ownership guard: only the owning vendor or a platform admin may issue refunds.
  const { userId } = getAuth(req);
  if (userId) {
    const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!adminIds.includes(userId)) {
      const { vendorsTable } = await import("@workspace/db");
      const [caller] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
      if (!caller || caller.id !== payment.vendorId) {
        // Revert the claim before rejecting.
        await db.update(paymentsTable).set({ status: "paid", updatedAt: new Date() }).where(eq(paymentsTable.id, paymentId)).catch(() => null);
        res.status(403).json({ error: "You are not authorised to refund this payment" });
        return;
      }
    }
  }

  if (payment.provider === "stripe") {
    await callWithPlatformStripe(async (stripe) => {
      // The providerReference is the Checkout Session ID — retrieve PaymentIntent from it
      const session = await stripe.checkout.sessions.retrieve(payment.providerReference);
      const paymentIntentId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;

      if (!paymentIntentId) {
        throw Object.assign(new Error("Could not resolve Stripe PaymentIntent from session"), { statusCode: 502 });
      }

      await stripe.refunds.create({
        payment_intent: paymentIntentId,
        ...(partialAmount != null ? { amount: Math.round(partialAmount * 100) } : {}),
      });
    });
  } else if (payment.provider === "paystack") {
    const paystackKey = await resolveGatewayField("paystack", "secretKey");
    if (!paystackKey) {
      res.status(503).json({ error: "Paystack is not configured. Add a platform Paystack key in Admin \u2192 Payment Gateways." });
      return;
    }

    const response = await fetch(`${PAYSTACK_BASE}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: payment.providerReference,
        ...(partialAmount != null ? { amount: Math.round(partialAmount * 100) } : {}),
      }),
    });

    const data = (await response.json()) as { status: boolean; message: string };
    if (!data.status) {
      res.status(502).json({ error: `Paystack refund error: ${data.message}` });
      return;
    }
  } else if (payment.provider === "flutterwave") {
    const flutterwaveKey = await resolveGatewayField("flutterwave", "secretKey");
    if (!flutterwaveKey) {
      res.status(503).json({ error: "Flutterwave is not configured. Add a platform Flutterwave key in Admin \u2192 Payment Gateways." });
      return;
    }

    // The providerReference is the tx_ref we generated at checkout — Flutterwave's
    // refund endpoint needs the numeric transaction id, so resolve it first.
    const verifyResponse = await fetch(
      `${FLUTTERWAVE_BASE}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(payment.providerReference)}`,
      { headers: { Authorization: `Bearer ${flutterwaveKey}` } },
    );
    const verifyData = (await verifyResponse.json().catch(() => ({}))) as {
      status?: string;
      message?: string;
      data?: { id?: number };
    };
    if (verifyData.status !== "success" || !verifyData.data?.id) {
      res.status(502).json({ error: `Flutterwave error: could not resolve transaction (${verifyData.message ?? "not found"})` });
      return;
    }

    const refundResponse = await fetch(`${FLUTTERWAVE_BASE}/transactions/${verifyData.data.id}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${flutterwaveKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(partialAmount != null ? { amount: partialAmount } : {}),
    });
    const refundData = (await refundResponse.json().catch(() => ({}))) as { status?: string; message?: string };
    if (refundData.status !== "success") {
      res.status(502).json({ error: `Flutterwave refund error: ${refundData.message ?? "refund failed"}` });
      return;
    }
  } else if (payment.provider === "nomba") {
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

    const refundResponse = await fetch(`${NOMBA_BASE}/transactions/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        accountId: creds.accountId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order: { orderReference: payment.providerReference } }),
    });
    const refundData = (await refundResponse.json().catch(() => ({}))) as {
      code?: string;
      description?: string;
      message?: string;
    };
    if (!refundResponse.ok) {
      res.status(502).json({ error: `Nomba refund error: ${refundData.description ?? refundData.message ?? "refund failed"}` });
      return;
    }
  } else if (payment.provider === "paypal") {
    const paypalCreds = await getPlatformCredentials("paypal");
    if (!paypalCreds?.clientId || !paypalCreds?.clientSecret) {
      res.status(503).json({ error: "PayPal is not configured. Add platform PayPal credentials in Admin → Payment Gateways." });
      return;
    }

    const { getPayPalAccessToken, paypalBaseUrl } = await import("../../lib/paypal-catalog");
    const mode = paypalCreds.mode ?? "live";
    const base = paypalBaseUrl(mode);

    let ppToken: string;
    try {
      ppToken = await getPayPalAccessToken(paypalCreds.clientId, paypalCreds.clientSecret, mode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: `PayPal auth failed: ${msg}` });
      return;
    }

    // The providerReference is the PayPal Order ID.
    // We need to find the capture ID from the order to refund it.
    const orderRes = await fetch(`${base}/v2/checkout/orders/${payment.providerReference}`, {
      headers: { Authorization: `Bearer ${ppToken}` },
    });
    const orderData = (await orderRes.json().catch(() => ({}))) as {
      purchase_units?: Array<{
        payments?: { captures?: Array<{ id: string; status: string }> };
      }>;
    };
    const captureId = orderData.purchase_units?.[0]?.payments?.captures?.find((c) => c.status === "COMPLETED")?.id;
    if (!captureId) {
      res.status(502).json({ error: "PayPal: could not find a completed capture to refund for this order" });
      return;
    }

    const refundRes = await fetch(`${base}/v2/payments/captures/${captureId}/refund`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ppToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(partialAmount != null
        ? { amount: { value: partialAmount.toFixed(2), currency_code: (payment.currency ?? "USD").toUpperCase() } }
        : {}
      ),
    });
    if (!refundRes.ok) {
      const text = await refundRes.text().catch(() => "(no body)");
      res.status(502).json({ error: `PayPal refund failed (${refundRes.status}): ${text}` });
      return;
    }
  } else if (payment.provider === "squad") {
    const { resolveSquadKey, squadRefundTransaction, squadVerifyTransaction } = await import("../../lib/squad");
    const squadKey = await resolveSquadKey().catch(() => null);
    if (!squadKey) {
      res.status(503).json({ error: "Squad is not configured. Add a Squad key in Admin → Payment Gateways." });
      return;
    }
    // Resolve the gateway transaction reference (Squad uses a separate gatewayTransactionRef)
    const verifyResult = await squadVerifyTransaction(squadKey, payment.providerReference).catch(() => null);
    const gatewayRef = (verifyResult?.data as { gateway_ref?: string })?.gateway_ref ?? payment.providerReference;
    await squadRefundTransaction(squadKey, {
      gatewayTransactionRef: gatewayRef,
      transactionRef:        payment.providerReference,
      refundType:            partialAmount != null ? "partial" : "full",
      reasonForRefund:       "Refund requested",
      ...(partialAmount != null ? { refundAmount: String(Math.round(partialAmount * 100)) } : {}),
    });
  } else if (payment.provider === "interswitch") {
    const { resolveInterswitchCreds: resolveISCreds } = await import("../../lib/vendor-keys");
    const { interswitchRefund: isRefund } = await import("../../lib/interswitch");
    const isCreds = await resolveISCreds().catch(() => null);
    if (!isCreds) {
      res.status(503).json({ error: "Interswitch is not configured. Add credentials in Admin → Payment Gateways." });
      return;
    }
    const requestRef = `IS-REF-${Date.now()}`;
    await isRefund(isCreds, {
      requestRef,
      transactionRef: payment.providerReference,
      amount: Math.round((partialAmount ?? parseFloat(payment.amount)) * 100),
      reason: "Refund requested",
    });
  } else if (payment.provider === "remita") {
    // Remita has no generic refund API — reversals must be requested directly
    // with Remita/the bank and reconciled manually. Revert the "refunding" claim
    // so the admin can retry after manual reconciliation.
    await db.update(paymentsTable).set({ status: "paid", updatedAt: new Date() }).where(eq(paymentsTable.id, paymentId)).catch(() => null);
    res.status(501).json({
      error: "Remita does not support refunds via API. Contact Remita support to reverse this transaction, then update the payment status manually.",
    });
    return;
  } else {
    await db.update(paymentsTable).set({ status: "paid", updatedAt: new Date() }).where(eq(paymentsTable.id, paymentId)).catch(() => null);
    res.status(400).json({ error: `Unknown provider '${payment.provider}'` });
    return;
  }

  // Mark payment as fully or partially refunded
  const isPartial = partialAmount != null && partialAmount < parseFloat(payment.amount);
  await db
    .update(paymentsTable)
    .set({ status: isPartial ? "partially_refunded" : "refunded", updatedAt: new Date() })
    .where(eq(paymentsTable.id, paymentId));

  // Mark associated order as refunded if present
  let customerEmail: string | null = null;
  let customerName: string | null = null;
  if (payment.orderId) {
    const [order] = await db
      .select({ paymentStatus: ordersTable.paymentStatus, customerEmail: ordersTable.customerEmail, customerName: ordersTable.customerName })
      .from(ordersTable)
      .where(eq(ordersTable.id, payment.orderId));
    if (order) {
      customerEmail = order.customerEmail ?? null;
      customerName = order.customerName ?? null;
      await db
        .update(ordersTable)
        .set({ paymentStatus: isPartial ? "partially_refunded" : "refunded", updatedAt: new Date() })
        .where(eq(ordersTable.id, payment.orderId));

      // Restore stock for each item in the fully refunded order (not for partials).
      if (!isPartial) try {
        const items = await db
          .select({ productId: orderItemsTable.productId, quantity: orderItemsTable.quantity })
          .from(orderItemsTable)
          .where(eq(orderItemsTable.orderId, payment.orderId));
        for (const item of items) {
          await db
            .update(productsTable)
            .set({ stockQuantity: sql`${productsTable.stockQuantity} + ${item.quantity}` })
            .where(eq(productsTable.id, item.productId));
        }
      } catch (stockErr) {
        // Non-fatal — refund already succeeded; admin can reconcile stock manually.
        console.error("[payments] refund stock restore failed:", stockErr);
      }
    }
  }

  await notifyVendorPaymentStatus(payment.vendorId, "refunded", payment.amount, payment.currency);

  // Notify the customer via in-app notification + email (best-effort).
  if (customerEmail) {
    void notifyCustomerRefund({
      customerEmail,
      customerName,
      amount:   payment.amount,
      currency: payment.currency ?? "USD",
      orderId:  payment.orderId ?? null,
    });
  }

  console.info(`[payments] refund issued — id=${paymentId} provider=${payment.provider} reference=${payment.providerReference}`);
  res.json({ success: true, paymentId, status: "refunded" });
  } catch (err) {
    // If the gateway call failed after we claimed the "refunding" status,
    // revert back to "paid" so the admin can retry.
    await db
      .update(paymentsTable)
      .set({ status: "paid", updatedAt: new Date() })
      .where(and(eq(paymentsTable.id, paymentId), sql`${paymentsTable.status} = 'refunding'`))
      .catch(() => { /* best-effort revert */ });
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : "Refund failed";
    console.error("POST /payments/:id/refund error:", err);
    res.status(statusCode).json({ error: message });
  }
});

/**
 * GET /payments/webhook-events
 * List recent webhook events for debugging. Supports ?provider=&limit= query params.
 */
router.get("/payments/webhook-events", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }

  const { provider, limit } = req.query as { provider?: string; limit?: string };
  const take = Math.min(parseInt(limit ?? "100") || 100, 500);

  let events = await db
    .select()
    .from(webhookEventsTable)
    .orderBy(desc(webhookEventsTable.receivedAt))
    .limit(take);

  if (provider) events = events.filter((e) => e.provider === provider);

  res.json({ events, total: events.length });
});

/**
 * POST /payments/webhook-events/:id/retry
 * Re-processes a skipped/failed webhook event's stored raw payload through the
 * same business logic as the live handler. Admin-only recovery action.
 */
router.post("/payments/webhook-events/:id/retry", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid webhook event id" });
    return;
  }

  try {
    const result = await retryWebhookEventById(id);
    res.json({ success: true, eventId: result.eventId, warning: result.warning });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : "Retry failed";
    res.status(statusCode).json({ error: message });
  }
});

/**
 * GET /payments
 * List all payment transactions. Admin only. Filterable by vendorId, provider, status.
 */
router.get("/payments", async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required" }); return; }

    const { vendorId, provider, status, from, to } = req.query as {
      vendorId?: string;
      provider?: string;
      status?: string;
      from?: string;
      to?: string;
    };

    let payments = await db
      .select()
      .from(paymentsTable)
      .orderBy(desc(paymentsTable.createdAt));

    if (vendorId) payments = payments.filter((p) => p.vendorId === parseInt(vendorId));
    if (provider) payments = payments.filter((p) => p.provider === provider);
    if (status) payments = payments.filter((p) => p.status === status);
    if (from) {
      const d = new Date(from);
      if (!isNaN(d.getTime())) payments = payments.filter((p) => new Date(p.createdAt) >= d);
    }
    if (to) {
      const d = new Date(to);
      if (!isNaN(d.getTime())) payments = payments.filter((p) => new Date(p.createdAt) <= d);
    }

    // Compute revenue summary — all supported providers
    const paidPayments = payments.filter((p) => p.status === "paid");
    const providers = ["stripe", "paystack", "paypal", "flutterwave", "nomba", "remita"] as const;
    const revenueByProvider = Object.fromEntries(
      providers.map((prov) => [
        prov,
        paidPayments
          .filter((p) => p.provider === prov)
          .reduce((s, p) => s + parseFloat(p.amount), 0),
      ])
    );

    res.json({
      payments: payments.map((p) => ({ ...p, amount: parseFloat(p.amount) })),
      summary: {
        total: payments.length,
        paid: paidPayments.length,
        totalRevenue: paidPayments.reduce((s, p) => s + parseFloat(p.amount), 0),
        revenueByProvider,
      },
    });
  } catch (err) {
    console.error("GET /payments error:", err);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// ── Manual Payment Record ─────────────────────────────────────────────────────
router.post("/payments/manual", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const { vendorsTable: vt } = await import("@workspace/db");
  const [myVendor] = await db.select({ id: vt.id }).from(vt).where(eq(vt.clerkUserId, userId));
  if (!myVendor && !isAdmin) { res.status(403).json({ error: "Vendor not found" }); return; }

  const { amount, provider, providerReference, currency, status, orderId, notes } = req.body;
  if (!amount) { res.status(400).json({ error: "amount is required" }); return; }

  // Admins who have no vendor row must supply an explicit vendorId in the body.
  // Admins who also have a vendor row (or non-admin vendors) use their own id.
  let vendorId: number;
  if (!myVendor) {
    // Must be admin (checked above). Require explicit vendorId.
    const bodyVendorId = Number(req.body.vendorId);
    if (!req.body.vendorId || isNaN(bodyVendorId)) {
      res.status(400).json({ error: "vendorId is required when your account has no vendor profile" }); return;
    }
    const { vendorsTable: vt2 } = await import("@workspace/db");
    const [target] = await db.select({ id: vt2.id }).from(vt2).where(eq(vt2.id, bodyVendorId));
    if (!target) { res.status(404).json({ error: "Vendor not found" }); return; }
    vendorId = target.id;
  } else {
    vendorId = myVendor.id;
  }
  const [payment] = await db.insert(paymentsTable).values({
    vendorId,
    orderId: orderId ? Number(orderId) : null,
    provider: provider ?? "manual",
    providerReference: providerReference ?? `MANUAL-${Date.now()}`,
    amount: String(parseFloat(amount)),
    currency: currency ?? "USD",
    status: status ?? "paid",
    metadata: notes ? { notes } : null,
  }).returning();

  if (orderId && (status ?? "paid") === "paid") {
    await db.update(ordersTable)
      .set({ paymentStatus: "paid", status: "completed" })
      .where(and(eq(ordersTable.id, Number(orderId)), eq(ordersTable.vendorId, vendorId)));
  }

  res.status(201).json({ ...payment, amount: parseFloat(payment!.amount) });
});

export default router;
