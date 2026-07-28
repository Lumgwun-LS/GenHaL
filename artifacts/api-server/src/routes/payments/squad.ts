/**
 * Squad payment routes — checkout, virtual accounts, transfers, verification.
 *
 * POST /payments/squad/initialize          — start a checkout session
 * GET  /payments/squad/verify/:ref         — verify a transaction
 * POST /payments/squad/virtual-account     — create dynamic virtual account for an order
 * POST /payments/squad/transfer            — payout to a bank account
 * GET  /payments/squad/transfer/:ref       — transfer status
 * GET  /payments/squad/balance             — wallet balance (NGN or USD)
 * GET  /payments/squad/banks               — list Nigerian banks
 * POST /payments/squad/verify-account      — resolve account name
 * POST /payments/squad/verify-bvn          — BVN lookup
 * POST /payments/squad/refund              — refund a transaction
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, paymentsTable, ordersTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveSquadKey, squadInitiatePayment, squadVerifyTransaction, squadCreateDynamicVirtualAccount, squadInitiateTransfer, squadGetTransferStatus, squadGetWalletBalance, squadListBanks, squadVerifyBankAccount, squadVerifyBVN, squadRefundTransaction } from "../../lib/squad";
import { findActivePendingPayment } from "../../lib/payment-guard";

const router = Router();

async function resolveVendor(userId: string) {
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const [v] = await db.select({ id: vendorsTable.id, name: vendorsTable.name, squadEnabled: vendorsTable.squadEnabled, subscriptionTier: vendorsTable.subscriptionTier, verificationLevel: vendorsTable.verificationLevel }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId)).limit(1);
  return { vendor: v ?? null, isAdmin: adminIds.includes(userId) };
}

// ── POST /payments/squad/initialize ──────────────────────────────────────────

router.post("/payments/squad/initialize", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { vendor, isAdmin } = await resolveVendor(userId);
  if (!vendor && !isAdmin) { res.status(403).json({ error: "Vendor not found" }); return; }

  const { orderId, vendorId: bodyVendorId, amount: bodyAmount, currency = "NGN", email, callbackUrl, description } = req.body as {
    orderId?: number; vendorId?: number; amount: number; currency?: string;
    email: string; callbackUrl?: string; description?: string;
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

  const [v] = await db.select({ squadEnabled: vendorsTable.squadEnabled }).from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!v?.squadEnabled) { res.status(403).json({ error: "Squad is not enabled for this vendor" }); return; }

  const secretKey = await resolveSquadKey();
  const transactionRef = `SQ-${vendorId}-${Date.now()}`;
  const amountKobo = Math.round(amount * 100);

  const result = await squadInitiatePayment(secretKey, {
    email, amount: amountKobo, currency: currency as "NGN" | "USD",
    transactionRef, callbackUrl: callbackUrl ?? `${process.env.APP_URL ?? ""}/payments/squad/callback`,
    metadata: { orderId, vendorId, description },
  });

  const [payment] = await db.insert(paymentsTable).values({
    vendorId, orderId: orderId ?? null,
    provider: "squad",
    providerReference: result.data.transaction_ref ?? transactionRef,
    amount: String(amount),
    currency,
    status: "pending",
    metadata: { squadTransactionRef: transactionRef, checkoutUrl: result.data.checkout_url },
  }).returning();

  res.json({ paymentId: payment!.id, reference: result.data.transaction_ref, url: result.data.checkout_url });
});

// ── GET /payments/squad/verify/:ref ──────────────────────────────────────────

router.get("/payments/squad/verify/:ref", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const secretKey = await resolveSquadKey();
  const result = await squadVerifyTransaction(secretKey, req.params.ref);
  res.json(result.data);
});

// ── POST /payments/squad/virtual-account ────────────────────────────────────

router.post("/payments/squad/virtual-account", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { vendor } = await resolveVendor(userId);
  if (!vendor) { res.status(403).json({ error: "Vendor not found" }); return; }

  const { customerIdentifier, amount, expiredDate, callbackUrl, isSingleUse } = req.body;
  if (!customerIdentifier) { res.status(400).json({ error: "customerIdentifier is required" }); return; }

  const secretKey = await resolveSquadKey();
  const result = await squadCreateDynamicVirtualAccount(secretKey, { customerIdentifier, amount, expiredDate, callbackUrl, isSingleUse });
  res.json(result.data);
});

// ── POST /payments/squad/transfer ─────────────────────────────────────────────

router.post("/payments/squad/transfer", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { vendor } = await resolveVendor(userId);
  if (!vendor) { res.status(403).json({ error: "Vendor not found" }); return; }

  const { amount, bankCode, accountNumber, accountName, remark } = req.body;
  if (!amount || !bankCode || !accountNumber || !accountName) { res.status(400).json({ error: "amount, bankCode, accountNumber and accountName are required" }); return; }

  const secretKey = await resolveSquadKey();
  const transactionRef = `SQ-TRF-${vendor.id}-${Date.now()}`;
  const result = await squadInitiateTransfer(secretKey, { transactionRef, amount: Math.round(amount * 100), bankCode, accountNumber, accountName, remark });
  res.json(result.data);
});

// ── GET /payments/squad/transfer/:ref ────────────────────────────────────────

router.get("/payments/squad/transfer/:ref", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const secretKey = await resolveSquadKey();
  const result = await squadGetTransferStatus(secretKey, req.params.ref);
  res.json(result.data);
});

// ── GET /payments/squad/balance ───────────────────────────────────────────────

router.get("/payments/squad/balance", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { vendor } = await resolveVendor(userId);
  if (!vendor) { res.status(403).json({ error: "Vendor not found" }); return; }

  const secretKey = await resolveSquadKey();
  const currency = (req.query.currency as "NGN" | "USD") ?? "NGN";
  const result = await squadGetWalletBalance(secretKey, currency);
  res.json(result.data);
});

// ── GET /payments/squad/banks ─────────────────────────────────────────────────

router.get("/payments/squad/banks", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const secretKey = await resolveSquadKey();
  const result = await squadListBanks(secretKey);
  res.json(result.data);
});

// ── POST /payments/squad/verify-account ──────────────────────────────────────

router.post("/payments/squad/verify-account", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { bankCode, accountNumber } = req.body;
  if (!bankCode || !accountNumber) { res.status(400).json({ error: "bankCode and accountNumber are required" }); return; }
  const secretKey = await resolveSquadKey();
  const result = await squadVerifyBankAccount(secretKey, { bank_code: bankCode, account_number: accountNumber });
  res.json(result.data);
});

// ── POST /payments/squad/verify-bvn ──────────────────────────────────────────

router.post("/payments/squad/verify-bvn", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { bvn, firstName, lastName, dateOfBirth, mobileNumber, gender } = req.body;
  if (!bvn) { res.status(400).json({ error: "bvn is required" }); return; }
  const secretKey = await resolveSquadKey();
  const result = await squadVerifyBVN(secretKey, { bvn, firstName, lastName, dateOfBirth, mobileNumber, gender });
  res.json(result.data);
});

// ── POST /payments/squad/refund ───────────────────────────────────────────────

router.post("/payments/squad/refund", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { gatewayTransactionRef, transactionRef, refundType = "full", reasonForRefund = "Refund", amount } = req.body;
  if (!gatewayTransactionRef || !transactionRef) { res.status(400).json({ error: "gatewayTransactionRef and transactionRef are required" }); return; }
  const secretKey = await resolveSquadKey();
  const result = await squadRefundTransaction(secretKey, { gatewayTransactionRef, transactionRef, refundType, reasonForRefund, amount });
  res.json(result.data);
});

export default router;
