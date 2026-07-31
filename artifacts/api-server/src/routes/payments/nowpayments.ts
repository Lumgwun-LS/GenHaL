/**
 * NOWPayments (USDT / crypto) routes.
 *
 * POST /payments/nowpayments/create   — vendor-initiated: create a USDT invoice for an order
 * POST /payments/nowpayments/webhook  — IPN callback from NOWPayments (no auth, signature-verified)
 */

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, paymentsTable, ordersTable, vendorsTable } from "@workspace/db";
import {
  createNowInvoice,
  verifyNowWebhookSignature,
  mapNowStatus,
} from "../../lib/nowpayments";
import { applyPaymentStatusTransition } from "./webhooks";
import { findActivePendingPayment } from "../../lib/payment-guard";

const router = Router();

// Default to USDT on TRC20 (cheapest fees); vendor can override via query param
const DEFAULT_PAY_CURRENCY = "usdttrc20";

// ── POST /payments/nowpayments/create ─────────────────────────────────────────
// Creates a hosted NOWPayments invoice for an existing order.
// Returns { invoiceId, invoiceUrl } — redirect customer to invoiceUrl.

router.post("/payments/nowpayments/create", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);

  const [vendor] = await db
    .select({ id: vendorsTable.id, nowpaymentsEnabled: vendorsTable.nowpaymentsEnabled, defaultCurrency: vendorsTable.defaultCurrency })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, userId))
    .limit(1);

  if (!vendor && !isAdmin) { res.status(403).json({ error: "Vendor not found" }); return; }

  const {
    orderId: bodyOrderId,
    vendorId: bodyVendorId,
    amount: bodyAmount,
    currency: bodyCurrency,
    payCurrency = DEFAULT_PAY_CURRENCY,
    customerEmail,
    successUrl,
    cancelUrl,
  } = req.body as {
    orderId?: number;
    vendorId?: number;
    amount?: number;
    currency?: string;
    payCurrency?: string;
    customerEmail?: string;
    successUrl?: string;
    cancelUrl?: string;
  };

  const vendorId: number = isAdmin ? (bodyVendorId ?? vendor!.id) : vendor!.id;

  // Check gateway enabled
  const [targetVendor] = await db
    .select({ nowpaymentsEnabled: vendorsTable.nowpaymentsEnabled, defaultCurrency: vendorsTable.defaultCurrency })
    .from(vendorsTable).where(eq(vendorsTable.id, vendorId)).limit(1);
  if (!targetVendor?.nowpaymentsEnabled && !isAdmin) {
    res.status(403).json({ error: "USDT payments are not enabled for this vendor" }); return;
  }

  let amount = bodyAmount;
  let currency = bodyCurrency ?? targetVendor?.defaultCurrency ?? "usd";

  if (bodyOrderId) {
    const existing = await findActivePendingPayment(bodyOrderId);
    if (existing?.checkoutUrl) {
      res.json({ paymentId: existing.id, invoiceUrl: existing.checkoutUrl }); return;
    }

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, bodyOrderId));
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    if (!isAdmin && order.vendorId !== vendorId) { res.status(403).json({ error: "Forbidden" }); return; }
    amount = parseFloat(order.totalAmount as string);
    currency = order.currency ?? currency;
  }

  if (!amount) { res.status(400).json({ error: "amount is required" }); return; }

  const baseHost = process.env.SITE_BASE_URL ?? `${req.protocol}://${req.headers.host}`;
  const orderId = bodyOrderId ?? null;
  const nowRef = `NP-${vendorId}-${orderId ?? ""}-${Date.now()}`;

  const invoice = await createNowInvoice({
    priceAmount:    amount,
    priceCurrency:  currency.toLowerCase(),
    payCurrency:    payCurrency.toLowerCase(),
    orderId:        nowRef,
    orderDescription: orderId ? `Order #${orderId}` : `Payment to vendor ${vendorId}`,
    ipnCallbackUrl: `${baseHost}/api/payments/nowpayments/webhook`,
    successUrl:     successUrl ?? `${baseHost}/api/embed/checkout-return?status=success&orderId=${orderId ?? ""}`,
    cancelUrl:      cancelUrl  ?? `${baseHost}/api/embed/checkout-return?status=cancelled&orderId=${orderId ?? ""}`,
    customerEmail,
  });

  const [payment] = await db.insert(paymentsTable).values({
    vendorId,
    orderId,
    provider:          "nowpayments",
    providerReference: nowRef,
    amount:            String(amount),
    currency:          currency.toUpperCase(),
    status:            "pending",
    metadata: {
      invoiceId:   invoice.id,
      invoiceUrl:  invoice.invoice_url,
      payCurrency: payCurrency.toLowerCase(),
      checkoutUrl: invoice.invoice_url,
    },
  }).returning();

  res.json({ paymentId: payment!.id, invoiceId: invoice.id, invoiceUrl: invoice.invoice_url });
});

// ── POST /payments/nowpayments/webhook ────────────────────────────────────────
// IPN callback from NOWPayments. Signature-verified, no auth.

router.post("/payments/nowpayments/webhook", async (req, res): Promise<void> => {
  const sig = (req.headers["x-nowpayments-sig"] ?? "") as string;

  if (!verifyNowWebhookSignature(req.body as Record<string, unknown>, sig)) {
    res.status(401).json({ error: "Invalid signature" }); return;
  }

  const { order_id: nowRef, payment_status: nowStatus } = req.body as {
    order_id: string;
    payment_status: string;
  };

  const internalStatus = mapNowStatus(nowStatus);
  if (!internalStatus || internalStatus === "pending") {
    // Nothing to do yet
    res.json({ ok: true }); return;
  }

  try {
    await applyPaymentStatusTransition(nowRef, internalStatus, "nowpayments");
  } catch (err) {
    console.error("[nowpayments webhook] transition error:", err);
    res.status(500).json({ error: "Internal error" }); return;
  }

  res.json({ ok: true });
});

export default router;
