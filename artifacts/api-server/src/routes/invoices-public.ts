/**
 * Public invoice routes — no authentication required.
 * Mounted BEFORE requireAuth in routes/index.ts.
 * All endpoints are scoped to a shareToken so only the recipient can access.
 */
import { Router } from "express";
import crypto from "crypto";
import { db, vendorsTable, invoicesTable, invoiceItemsTable, invoiceInstalmentPaymentsTable, paymentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { resolveGatewayField, callWithPlatformStripe, getPlatformCredentials } from "../lib/platform-gateways";

const router = Router();

const PAYSTACK_BASE = "https://api.paystack.co";

// ── GET /invoices/public/:token ───────────────────────────────────────────────
// Returns invoice + items + instalment schedule (no sensitive vendor data).

router.get("/invoices/public/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  if (!token) { res.status(400).json({ error: "Missing token" }); return; }

  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.shareToken, token));

  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (invoice.status === "cancelled") { res.status(410).json({ error: "This invoice has been cancelled" }); return; }

  const [items, instalments, vendor] = await Promise.all([
    db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoice.id)),
    db.select().from(invoiceInstalmentPaymentsTable)
      .where(eq(invoiceInstalmentPaymentsTable.invoiceId, invoice.id))
      .orderBy(invoiceInstalmentPaymentsTable.instalmentNumber),
    db.select({ name: vendorsTable.name, email: vendorsTable.email }).from(vendorsTable).where(eq(vendorsTable.id, invoice.vendorId)),
  ]);

  // Determine which gateways are enabled for this vendor
  const [stripeEnabled, paystackEnabled] = await Promise.all([
    resolveGatewayField("stripe", "secretKey").then((k) => Boolean(k)).catch(() => false),
    resolveGatewayField("paystack", "secretKey").then((k) => Boolean(k)).catch(() => false),
  ]);

  res.json({
    invoice: {
      id: invoice.id,
      customerName: invoice.customerName,
      currency: invoice.currency,
      subtotal: invoice.subtotal,
      discountAmount: invoice.discountAmount,
      taxAmount: invoice.taxAmount,
      totalAmount: invoice.totalAmount,
      status: invoice.status,
      dueDate: invoice.dueDate,
      notes: invoice.notes,
      createdAt: invoice.createdAt,
    },
    vendor: vendor[0] ? { name: vendor[0].name } : null,
    items,
    instalments,
    enabledGateways: [
      ...(stripeEnabled ? ["stripe"] : []),
      ...(paystackEnabled ? ["paystack"] : []),
    ],
  });
});

// ── POST /invoices/public/:token/pay ─────────────────────────────────────────
// Initiates a checkout session for a specific instalment.

router.post("/invoices/public/:token/pay", async (req, res): Promise<void> => {
  const { token } = req.params;
  if (!token) { res.status(400).json({ error: "Missing token" }); return; }

  const { instalmentId, gateway, customerEmail, successUrl, cancelUrl } = req.body as {
    instalmentId?: number;
    gateway?: string;
    customerEmail?: string;
    successUrl?: string;
    cancelUrl?: string;
  };

  if (!gateway) { res.status(400).json({ error: "gateway is required" }); return; }
  if (!successUrl || !cancelUrl) { res.status(400).json({ error: "successUrl and cancelUrl are required" }); return; }

  // Fetch invoice
  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.shareToken, token));

  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (invoice.status === "cancelled" || invoice.status === "paid") {
    res.status(409).json({ error: `This invoice is ${invoice.status} and cannot accept payment` });
    return;
  }

  // Determine which instalment to pay
  const allInstalments = await db
    .select()
    .from(invoiceInstalmentPaymentsTable)
    .where(eq(invoiceInstalmentPaymentsTable.invoiceId, invoice.id))
    .orderBy(invoiceInstalmentPaymentsTable.instalmentNumber);

  const instalment = instalmentId
    ? allInstalments.find((i) => i.id === instalmentId)
    : allInstalments.find((i) => i.status === "pending" || i.status === "overdue"); // first unpaid

  if (!instalment) { res.status(404).json({ error: "No pending instalment found" }); return; }
  if (instalment.status === "paid") { res.status(409).json({ error: "This instalment is already paid" }); return; }

  const amountNum = parseFloat(instalment.amount);
  const description = `Invoice #${invoice.id} — Instalment ${instalment.instalmentNumber} of ${allInstalments.length}`;
  const paymentMeta = {
    instalmentId: instalment.id,
    invoiceId: invoice.id,
    instalmentNumber: instalment.instalmentNumber,
  };

  if (gateway === "stripe") {
    let checkoutUrl: string | null = null;
    let providerReference: string | null = null;

    await callWithPlatformStripe(async (stripe) => {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: invoice.currency.toLowerCase(),
              unit_amount: Math.round(amountNum * 100),
              product_data: { name: description },
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: customerEmail || undefined,
        metadata: {
          instalmentId: String(instalment.id),
          invoiceId: String(invoice.id),
        },
      });
      checkoutUrl = session.url;
      providerReference = session.id;
    });

    if (!checkoutUrl || !providerReference) {
      res.status(502).json({ error: "Failed to create Stripe checkout session" });
      return;
    }

    const [payment] = await db.insert(paymentsTable).values({
      vendorId: invoice.vendorId,
      orderId: null,
      provider: "stripe",
      providerReference,
      amount: instalment.amount,
      currency: invoice.currency.toLowerCase(),
      status: "pending",
      metadata: { ...paymentMeta, checkoutUrl, sessionUrl: checkoutUrl },
    }).returning();

    res.json({ checkoutUrl, paymentId: payment!.id });
    return;
  }

  if (gateway === "paystack") {
    const paystackKey = await resolveGatewayField("paystack", "secretKey");
    if (!paystackKey) {
      res.status(503).json({ error: "Paystack is not configured for this vendor" });
      return;
    }

    const email = customerEmail || invoice.customerEmail;
    if (!email) { res.status(400).json({ error: "customerEmail is required for Paystack" }); return; }

    const reference = `INV-${invoice.id}-INST-${instalment.id}-${Date.now()}`;

    const paystackRes = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(amountNum * 100), // Paystack uses kobo
        email,
        reference,
        callback_url: successUrl,
        metadata: {
          custom_fields: [{ display_name: "Invoice", variable_name: "invoice_id", value: String(invoice.id) }],
          ...paymentMeta,
        },
      }),
    });

    const paystackData = await paystackRes.json() as { status: boolean; message: string; data?: { authorization_url?: string; reference?: string } };

    if (!paystackData.status || !paystackData.data?.authorization_url) {
      res.status(502).json({ error: `Paystack error: ${paystackData.message}` });
      return;
    }

    const [payment] = await db.insert(paymentsTable).values({
      vendorId: invoice.vendorId,
      orderId: null,
      provider: "paystack",
      providerReference: paystackData.data.reference ?? reference,
      amount: instalment.amount,
      currency: invoice.currency,
      status: "pending",
      metadata: { ...paymentMeta, authorization_url: paystackData.data.authorization_url },
    }).returning();

    res.json({ checkoutUrl: paystackData.data.authorization_url, paymentId: payment!.id });
    return;
  }

  res.status(400).json({ error: `Gateway '${gateway}' is not supported for invoice payments. Use stripe or paystack.` });
});

export default router;
