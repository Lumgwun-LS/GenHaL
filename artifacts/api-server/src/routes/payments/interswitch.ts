/**
 * Interswitch payment routes.
 *
 * POST /payments/interswitch/initialize     — build Webpay checkout URL
 * GET  /payments/interswitch/verify/:ref    — requery a transaction
 * POST /payments/interswitch/transfer       — send money to bank account
 * GET  /payments/interswitch/transfer/:ref  — transfer status
 * POST /payments/interswitch/verify-account — resolve account name
 * POST /payments/interswitch/verify-bvn     — BVN lookup
 * POST /payments/interswitch/refund         — refund a transaction
 * POST /payments/interswitch/callback       — payment return callback (updates status)
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, paymentsTable, ordersTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  buildInterswitchPaymentUrl,
  interswitchQueryTransaction,
  interswitchSendMoney,
  interswitchQueryTransfer,
  interswitchVerifyAccount,
  interswitchVerifyBVN,
  interswitchRefund,
  verifyInterswitchHash,
  interswitchGetBillers,
  interswitchGetBillerItems,
  interswitchValidateBillPayment,
  interswitchPayBill,
  interswitchQueryBillPayment,
} from "../../lib/interswitch";
import { resolveInterswitchCreds } from "../../lib/vendor-keys";
import { findActivePendingPayment } from "../../lib/payment-guard";

const router = Router();

async function resolveVendor(userId: string) {
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const [v] = await db.select({ id: vendorsTable.id, interswitchEnabled: vendorsTable.interswitchEnabled }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId)).limit(1);
  return { vendor: v ?? null, isAdmin: adminIds.includes(userId) };
}

// ── POST /payments/interswitch/initialize ────────────────────────────────────

router.post("/payments/interswitch/initialize", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { vendor, isAdmin } = await resolveVendor(userId);
  if (!vendor && !isAdmin) { res.status(403).json({ error: "Vendor not found" }); return; }

  const { orderId, vendorId: bodyVendorId, amount: bodyAmount, currency = "NGN", email, callbackUrl } = req.body as {
    orderId?: number; vendorId?: number; amount: number; currency?: string;
    email: string; callbackUrl?: string;
  };
  const vendorId: number = isAdmin ? (bodyVendorId ?? vendor!.id) : vendor!.id;

  let amount = bodyAmount;
  if (orderId) {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
    if (!order) { res.status(404).json({ error: "Order not found" }); return; }
    if (!isAdmin && order.vendorId !== vendorId) { res.status(403).json({ error: "Forbidden" }); return; }
    if (order.status !== "pending") { res.status(409).json({ error: "Order is no longer available" }); return; }
    amount = parseFloat(order.totalAmount);
  }
  if (!amount || !email) { res.status(400).json({ error: "amount and email are required" }); return; }

  if (orderId) {
    const existing = await findActivePendingPayment(orderId);
    if (existing?.checkoutUrl) { res.json({ paymentId: existing.id, reference: existing.providerReference, url: existing.checkoutUrl }); return; }
  }

  const [v] = await db.select({ interswitchEnabled: vendorsTable.interswitchEnabled }).from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!v?.interswitchEnabled) { res.status(403).json({ error: "Interswitch is not enabled for this vendor" }); return; }

  const creds = await resolveInterswitchCreds();
  const transactionRef = `IS-${vendorId}-${Date.now()}`;
  const amountKobo = Math.round(amount * 100);
  const currencyCode = currency === "USD" ? "840" : "566";

  const { checkoutUrl } = buildInterswitchPaymentUrl(creds, {
    transactionRef, amount: amountKobo, customerId: email, customerEmail: email,
    callbackUrl: callbackUrl ?? `${process.env.APP_URL ?? ""}/api/payments/interswitch/callback`,
    currencyCode,
  });

  const [payment] = await db.insert(paymentsTable).values({
    vendorId, orderId: orderId ?? null,
    provider: "interswitch",
    providerReference: transactionRef,
    amount: String(amount),
    currency,
    status: "pending",
    metadata: { email, checkoutUrl },
  }).returning();

  res.json({ paymentId: payment!.id, reference: transactionRef, url: checkoutUrl });
});

// ── GET /payments/interswitch/verify/:ref ────────────────────────────────────

router.get("/payments/interswitch/verify/:ref", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const creds = await resolveInterswitchCreds();
  const result = await interswitchQueryTransaction(creds, req.params.ref);
  const paid = result.ResponseCode === "00";
  res.json({ ...result, paid });
});

// ── POST /payments/interswitch/callback ──────────────────────────────────────
// Called by Interswitch after the customer completes/abandons payment.

router.post("/payments/interswitch/callback", async (req, res): Promise<void> => {
  const { txnref, amount, responseCode, hash } = req.body as {
    txnref?: string; amount?: string; responseCode?: string; hash?: string;
  };

  if (!txnref) { res.status(400).json({ error: "txnref is required" }); return; }

  const creds = await resolveInterswitchCreds();

  // Verify hash if provided
  if (hash && !verifyInterswitchHash(creds, txnref, amount ?? "0", hash)) {
    res.status(400).json({ error: "Invalid hash" }); return;
  }

  // Always requery from Interswitch to confirm — don't trust callback body alone
  const query = await interswitchQueryTransaction(creds, txnref).catch(() => null);
  const paid = query?.ResponseCode === "00";

  try {
    const { db: _db, paymentsTable: _pt, ordersTable: _ot } = await import("@workspace/db");
    const { eq: _eq } = await import("drizzle-orm");
    const [pmt] = await _db.select().from(_pt).where(_eq(_pt.providerReference, txnref)).limit(1);
    if (pmt && pmt.status === "pending") {
      const newStatus = paid ? "paid" : "failed";
      await _db.update(_pt).set({ status: newStatus, updatedAt: new Date() }).where(_eq(_pt.providerReference, txnref));
      if (paid && pmt.orderId) {
        await _db.update(_ot).set({ paymentStatus: "paid", updatedAt: new Date() }).where(_eq(_ot.id, pmt.orderId));
      }
    }
  } catch { /* non-fatal */ }

  res.json({ ok: true, paid });
});

// ── POST /payments/interswitch/transfer ──────────────────────────────────────

router.post("/payments/interswitch/transfer", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { vendor } = await resolveVendor(userId);
  if (!vendor) { res.status(403).json({ error: "Vendor not found" }); return; }

  const { amount, beneficiaryAccount, beneficiaryBankCode, beneficiaryName, senderName, narration } = req.body;
  if (!amount || !beneficiaryAccount || !beneficiaryBankCode || !beneficiaryName) {
    res.status(400).json({ error: "amount, beneficiaryAccount, beneficiaryBankCode and beneficiaryName are required" }); return;
  }

  const creds = await resolveInterswitchCreds();
  const requestRef = `IS-TRF-${vendor.id}-${Date.now()}`;
  const result = await interswitchSendMoney(creds, {
    requestRef, amount: Math.round(amount * 100),
    beneficiaryAccount, beneficiaryBankCode, beneficiaryName,
    senderName: senderName ?? "Awa Biz Suite", narration,
  });
  res.json({ ...result, requestRef });
});

// ── GET /payments/interswitch/transfer/:ref ──────────────────────────────────

router.get("/payments/interswitch/transfer/:ref", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const creds = await resolveInterswitchCreds();
  const result = await interswitchQueryTransfer(creds, req.params.ref);
  res.json(result);
});

// ── POST /payments/interswitch/verify-account ────────────────────────────────

router.post("/payments/interswitch/verify-account", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { bankCode, accountNumber } = req.body;
  if (!bankCode || !accountNumber) { res.status(400).json({ error: "bankCode and accountNumber are required" }); return; }
  const creds = await resolveInterswitchCreds();
  const result = await interswitchVerifyAccount(creds, { bankCode, accountNumber });
  res.json(result);
});

// ── POST /payments/interswitch/verify-bvn ────────────────────────────────────

router.post("/payments/interswitch/verify-bvn", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { bvn } = req.body;
  if (!bvn) { res.status(400).json({ error: "bvn is required" }); return; }
  const creds = await resolveInterswitchCreds();
  const result = await interswitchVerifyBVN(creds, bvn);
  res.json(result);
});

// ── POST /payments/interswitch/refund ─────────────────────────────────────────

router.post("/payments/interswitch/refund", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { transactionRef, amount, reason } = req.body;
  if (!transactionRef || !amount) { res.status(400).json({ error: "transactionRef and amount are required" }); return; }
  const creds = await resolveInterswitchCreds();
  const requestRef = `IS-REF-${Date.now()}`;
  const result = await interswitchRefund(creds, { requestRef, transactionRef, amount: Math.round(amount * 100), reason });
  res.json(result);
});

// ── Bills Payment ─────────────────────────────────────────────────────────────

// GET /payments/interswitch/bills/billers
router.get("/payments/interswitch/bills/billers", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const creds = await resolveInterswitchCreds();
    const result = await interswitchGetBillers(creds);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch billers";
    res.status((err as { statusCode?: number }).statusCode ?? 502).json({ error: msg });
  }
});

// GET /payments/interswitch/bills/billers/:billerId/items
router.get("/payments/interswitch/bills/billers/:billerId/items", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const creds = await resolveInterswitchCreds();
    const result = await interswitchGetBillerItems(creds, req.params.billerId);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch biller items";
    res.status((err as { statusCode?: number }).statusCode ?? 502).json({ error: msg });
  }
});

// POST /payments/interswitch/bills/validate
router.post("/payments/interswitch/bills/validate", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { paymentCode, customerId } = req.body;
  if (!paymentCode || !customerId) {
    res.status(400).json({ error: "paymentCode and customerId are required" }); return;
  }
  try {
    const creds = await resolveInterswitchCreds();
    const result = await interswitchValidateBillPayment(creds, { paymentCode, customerId });
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Validation failed";
    res.status((err as { statusCode?: number }).statusCode ?? 502).json({ error: msg });
  }
});

// POST /payments/interswitch/bills/pay
router.post("/payments/interswitch/bills/pay", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { vendor } = await resolveVendor(userId);
  if (!vendor) { res.status(403).json({ error: "Vendor not found" }); return; }

  const {
    paymentCode, customerId, amount,
    customerName, customerEmail, customerPhone, narration,
  } = req.body as {
    paymentCode: string; customerId: string; amount: number;
    customerName?: string; customerEmail?: string; customerPhone?: string; narration?: string;
  };

  if (!paymentCode || !customerId || !amount) {
    res.status(400).json({ error: "paymentCode, customerId and amount are required" }); return;
  }

  try {
    const creds = await resolveInterswitchCreds();
    const requestRef = `IS-BILL-${vendor.id}-${Date.now()}`;
    const result = await interswitchPayBill(creds, {
      requestRef,
      paymentCode,
      customerId,
      amount: Math.round(amount * 100),
      customerName, customerEmail, customerPhone, narration,
    });
    res.json({ ...result, requestRef });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Bill payment failed";
    res.status((err as { statusCode?: number }).statusCode ?? 502).json({ error: msg });
  }
});

// GET /payments/interswitch/bills/status/:requestRef
router.get("/payments/interswitch/bills/status/:requestRef", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const creds = await resolveInterswitchCreds();
    const result = await interswitchQueryBillPayment(creds, req.params.requestRef);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Status query failed";
    res.status((err as { statusCode?: number }).statusCode ?? 502).json({ error: msg });
  }
});

export default router;
