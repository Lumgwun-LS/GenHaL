/**
 * Vendor wallet API routes.
 *
 * GET  /wallet/balance                — NGN balance, USD balance, pending payout
 * GET  /wallet/transactions           — paginated ledger
 * GET  /wallet/payouts                — payout history
 * POST /wallet/payout-request         — vendor requests a payout
 * GET  /wallet/bank-accounts          — saved payout bank accounts
 * POST /wallet/bank-accounts          — add a bank account (validates via Paystack)
 * DELETE /wallet/bank-accounts/:id    — remove a bank account
 * PUT  /wallet/bank-accounts/:id/default — set as default
 *
 * Admin:
 * GET  /admin/payouts                 — all pending/processing payouts
 * POST /admin/payouts/:id/approve     — initiate transfer
 * POST /admin/payouts/:id/reject      — refund to wallet
 * GET  /public/exchange-rate          — current USD→NGN rate (no auth)
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  db,
  vendorsTable,
  vendorWalletsTable,
  walletTransactionsTable,
  vendorPayoutsTable,
  vendorBankAccountsTable,
  vendorNotificationsTable,
} from "@workspace/db";
import { getSiteContentBlock, setSiteContentBlock } from "../lib/site-content";
import { sendEmail } from "../lib/mailer";
import { wrapVendorEmail, escapeHtml } from "../lib/email-branding";
import { initiatePayout } from "../lib/payout";

const PAYSTACK_BASE = "https://api.paystack.co";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAdminId(userId: string) {
  return (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean).includes(userId);
}

async function requireVendorAuth(req: import("express").Request, res: import("express").Response) {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const [v] = await db.select({ id: vendorsTable.id, email: vendorsTable.email, name: vendorsTable.name })
    .from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId)).limit(1);
  if (!v) { res.status(403).json({ error: "Vendor account not found" }); return null; }
  return v;
}

async function upsertWallet(vendorId: number) {
  await db.insert(vendorWalletsTable).values({ vendorId })
    .onConflictDoNothing();
  const [w] = await db.select().from(vendorWalletsTable).where(eq(vendorWalletsTable.vendorId, vendorId));
  return w!;
}

async function getWalletSettings(): Promise<{ usdToNgnRate: number; platformFeeRate: number }> {
  const block = await getSiteContentBlock("wallet.settings").catch(() => null);
  const settings = block as { usdToNgnRate?: number; platformFeeRate?: number } | null;
  return {
    usdToNgnRate:    settings?.usdToNgnRate    ?? 1650,
    platformFeeRate: settings?.platformFeeRate ?? 0.025,
  };
}

async function getUsdToNgn(): Promise<number> {
  return (await getWalletSettings()).usdToNgnRate;
}

async function getPlatformFeeRate(): Promise<number> {
  return (await getWalletSettings()).platformFeeRate;
}

// ── Public: exchange rate (mounted BEFORE requireAuth in routes/index.ts) ──────

export const walletPublicRouter = Router();
walletPublicRouter.get("/public/exchange-rate", async (_req, res): Promise<void> => {
  const settings = await getWalletSettings();
  res.json({ usdToNgn: settings.usdToNgnRate, platformFeeRate: settings.platformFeeRate });
});

// ── Wallet balance ────────────────────────────────────────────────────────────

router.get("/wallet/balance", async (req, res): Promise<void> => {
  const vendor = await requireVendorAuth(req, res); if (!vendor) return;
  const wallet = await upsertWallet(vendor.id);
  const usdToNgn = await getUsdToNgn();
  const usdInNgn = parseFloat(wallet.usdBalance) * usdToNgn;
  const totalNgn = parseFloat(wallet.ngnBalance) + usdInNgn;
  res.json({
    ngnBalance:       parseFloat(wallet.ngnBalance),
    usdBalance:       parseFloat(wallet.usdBalance),
    pendingNgnPayout: parseFloat(wallet.pendingNgnPayout),
    usdInNgn,
    totalNgn,
    usdToNgn,
  });
});

// ── Transactions ──────────────────────────────────────────────────────────────

router.get("/wallet/transactions", async (req, res): Promise<void> => {
  const vendor = await requireVendorAuth(req, res); if (!vendor) return;
  const { type, currency, limit = "50", offset = "0" } = req.query as {
    type?: string; currency?: string; limit?: string; offset?: string;
  };
  let rows = await db.select().from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.vendorId, vendor.id))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(Math.min(parseInt(limit) || 50, 200))
    .offset(parseInt(offset) || 0);
  if (type) rows = rows.filter(r => r.type === type);
  if (currency) rows = rows.filter(r => r.currency === currency);
  res.json({ transactions: rows.map(r => ({ ...r, amount: parseFloat(r.amount), createdAt: r.createdAt.toISOString() })) });
});

// ── Payouts ───────────────────────────────────────────────────────────────────

router.get("/wallet/payouts", async (req, res): Promise<void> => {
  const vendor = await requireVendorAuth(req, res); if (!vendor) return;
  const rows = await db.select().from(vendorPayoutsTable)
    .where(eq(vendorPayoutsTable.vendorId, vendor.id))
    .orderBy(desc(vendorPayoutsTable.createdAt));
  res.json({
    payouts: rows.map(r => ({
      ...r,
      amountNgn:   parseFloat(r.amountNgn),
      requestedAt: r.requestedAt.toISOString(),
      processedAt: r.processedAt?.toISOString() ?? null,
      createdAt:   r.createdAt.toISOString(),
    })),
  });
});

router.post("/wallet/payout-request", async (req, res): Promise<void> => {
  const vendor = await requireVendorAuth(req, res); if (!vendor) return;
  const { amountNgn, provider, bankAccountId, convertUsd } = req.body as {
    amountNgn: number; provider: "paystack" | "interswitch" | "squad";
    bankAccountId: number; convertUsd?: boolean;
  };
  if (!amountNgn || amountNgn <= 0) { res.status(400).json({ error: "amountNgn must be > 0" }); return; }
  if (!["paystack","interswitch","squad"].includes(provider)) {
    res.status(400).json({ error: "Invalid provider" }); return;
  }
  if (!bankAccountId) { res.status(400).json({ error: "bankAccountId is required" }); return; }

  // Verify bank account belongs to this vendor before opening the transaction
  const [bankAcct] = await db.select().from(vendorBankAccountsTable)
    .where(and(eq(vendorBankAccountsTable.id, bankAccountId), eq(vendorBankAccountsTable.vendorId, vendor.id)));
  if (!bankAcct) { res.status(404).json({ error: "Bank account not found" }); return; }

  const rate = await getUsdToNgn();

  // Atomic reservation: check availability + insert payout + increment pendingNgnPayout
  // inside one transaction so concurrent requests cannot over-reserve funds.
  let payout: typeof import("@workspace/db").vendorPayoutsTable.$inferSelect | null = null;
  try {
    payout = await db.transaction(async (tx) => {
      // Lock wallet row for update (serialises concurrent payout requests)
      const [wallet] = await tx.execute(
        sql`SELECT ngn_balance::numeric, usd_balance::numeric, pending_ngn_payout::numeric FROM vendor_wallets WHERE vendor_id = ${vendor.id} FOR UPDATE`
      ) as unknown as [{ ngn_balance: string; usd_balance: string; pending_ngn_payout: string }];

      // Create wallet row if it doesn't exist yet
      if (!wallet) {
        await tx.insert(vendorWalletsTable).values({ vendorId: vendor.id }).onConflictDoNothing();
      }

      const ngnBal     = parseFloat(wallet?.ngn_balance      ?? "0");
      const usdBal     = parseFloat(wallet?.usd_balance      ?? "0");
      const pendingBal = parseFloat(wallet?.pending_ngn_payout ?? "0");
      const availableNgn = (ngnBal - pendingBal) + (convertUsd ? usdBal * rate : 0);

      if (amountNgn > availableNgn + 0.001) { // 0.001 epsilon for floating-point rounding
        throw Object.assign(new Error(`Insufficient balance. Available: NGN ${availableNgn.toFixed(2)}`), { statusCode: 400 });
      }

      const [row] = await tx.insert(vendorPayoutsTable).values({
        vendorId:           vendor.id,
        amountNgn:          String(amountNgn),
        status:             "pending",
        provider,
        bankAccountId:      bankAcct.id,
        notes:              convertUsd ? "Includes USD conversion" : undefined,
        // Snapshot FX rate at request time so settlement is deterministic
        // regardless of admin rate changes between request and approval.
        lockedUsdToNgnRate: String(rate),
      }).returning();

      await tx.update(vendorWalletsTable)
        .set({ pendingNgnPayout: sql`${vendorWalletsTable.pendingNgnPayout} + ${String(amountNgn)}`, updatedAt: new Date() })
        .where(eq(vendorWalletsTable.vendorId, vendor.id));

      return row;
    });
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode ?? 500;
    res.status(code).json({ error: err instanceof Error ? err.message : "Failed" });
    return;
  }

  // In-app notification
  await db.insert(vendorNotificationsTable).values({
    vendorId: vendor.id,
    type: "payout_requested",
    message: `Your payout request of NGN ${amountNgn.toLocaleString()} has been submitted and is pending approval.`,
  }).catch(() => null);

  res.status(201).json({ payout: { ...payout, amountNgn: parseFloat(payout!.amountNgn), requestedAt: payout!.requestedAt.toISOString(), createdAt: payout!.createdAt.toISOString() } });
});

// ── Bank accounts ─────────────────────────────────────────────────────────────

router.get("/wallet/bank-accounts", async (req, res): Promise<void> => {
  const vendor = await requireVendorAuth(req, res); if (!vendor) return;
  const rows = await db.select().from(vendorBankAccountsTable)
    .where(eq(vendorBankAccountsTable.vendorId, vendor.id))
    .orderBy(desc(vendorBankAccountsTable.createdAt));
  res.json({ bankAccounts: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })) });
});

router.post("/wallet/bank-accounts", async (req, res): Promise<void> => {
  const vendor = await requireVendorAuth(req, res); if (!vendor) return;
  const { bankCode, bankName, accountNumber, provider = "paystack" } = req.body as {
    bankCode: string; bankName: string; accountNumber: string; provider?: string;
  };
  if (!bankCode || !bankName || !accountNumber) {
    res.status(400).json({ error: "bankCode, bankName and accountNumber are required" }); return;
  }

  // Resolve account name via Paystack bank/resolve (best-effort)
  let accountName = (req.body.accountName ?? "") as string;
  let paystackRecipientCode: string | null = null;
  try {
    const { resolveGatewayField } = await import("../lib/platform-gateways");
    const psKey = await resolveGatewayField("paystack", "secretKey").catch(() => null);
    if (psKey) {
      const verifyRes = await fetch(`${PAYSTACK_BASE}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`, {
        headers: { Authorization: `Bearer ${psKey}` },
      });
      const verifyData = (await verifyRes.json()) as { status: boolean; data?: { account_name: string } };
      if (verifyData.status && verifyData.data?.account_name) {
        accountName = verifyData.data.account_name;
      }
    }
  } catch { /* non-fatal */ }

  if (!accountName) { res.status(400).json({ error: "Could not resolve account name. Please provide accountName manually." }); return; }

  // Check if already exists
  const existing = await db.select({ id: vendorBankAccountsTable.id })
    .from(vendorBankAccountsTable)
    .where(and(eq(vendorBankAccountsTable.vendorId, vendor.id), eq(vendorBankAccountsTable.accountNumber, accountNumber), eq(vendorBankAccountsTable.bankCode, bankCode)));
  if (existing.length > 0) { res.status(409).json({ error: "This bank account is already saved." }); return; }

  // If it's Paystack, create a transfer recipient for faster future payouts
  if (provider === "paystack") {
    try {
      const { resolveGatewayField } = await import("../lib/platform-gateways");
      const psKey = await resolveGatewayField("paystack", "secretKey").catch(() => null);
      if (psKey) {
        const rcRes = await fetch(`${PAYSTACK_BASE}/transferrecipient`, {
          method: "POST",
          headers: { Authorization: `Bearer ${psKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ type: "nuban", name: accountName, account_number: accountNumber, bank_code: bankCode, currency: "NGN" }),
        });
        const rcData = (await rcRes.json()) as { status: boolean; data?: { recipient_code: string } };
        if (rcData.status && rcData.data?.recipient_code) paystackRecipientCode = rcData.data.recipient_code;
      }
    } catch { /* non-fatal */ }
  }

  // Set as default if first account
  const countRows = await db.select({ count: sql<number>`count(*)` })
    .from(vendorBankAccountsTable).where(eq(vendorBankAccountsTable.vendorId, vendor.id));
  const isFirst = (countRows[0]?.count ?? 0) === 0;

  const [saved] = await db.insert(vendorBankAccountsTable).values({
    vendorId: vendor.id, provider, bankCode, bankName, accountNumber, accountName,
    paystackRecipientCode, isDefault: isFirst,
  }).returning();

  res.status(201).json({ bankAccount: { ...saved, createdAt: saved!.createdAt.toISOString() } });
});

router.delete("/wallet/bank-accounts/:id", async (req, res): Promise<void> => {
  const vendor = await requireVendorAuth(req, res); if (!vendor) return;
  const id = parseInt(req.params.id);
  await db.delete(vendorBankAccountsTable)
    .where(and(eq(vendorBankAccountsTable.id, id), eq(vendorBankAccountsTable.vendorId, vendor.id)));
  res.json({ ok: true });
});

router.put("/wallet/bank-accounts/:id/default", async (req, res): Promise<void> => {
  const vendor = await requireVendorAuth(req, res); if (!vendor) return;
  const id = parseInt(req.params.id);
  await db.update(vendorBankAccountsTable).set({ isDefault: false })
    .where(eq(vendorBankAccountsTable.vendorId, vendor.id));
  await db.update(vendorBankAccountsTable).set({ isDefault: true })
    .where(and(eq(vendorBankAccountsTable.id, id), eq(vendorBankAccountsTable.vendorId, vendor.id)));
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════════
// ADMIN PAYOUT QUEUE
// ════════════════════════════════════════════════════════════════════════════════

router.get("/admin/payouts", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdminId(userId)) { res.status(403).json({ error: "Admin only" }); return; }
  const { status = "pending" } = req.query as { status?: string };

  const rows = await db
    .select({
      payout:  vendorPayoutsTable,
      vendor:  { id: vendorsTable.id, name: vendorsTable.name, email: vendorsTable.email },
      bankAcct: { bankName: vendorBankAccountsTable.bankName, accountNumber: vendorBankAccountsTable.accountNumber, accountName: vendorBankAccountsTable.accountName },
    })
    .from(vendorPayoutsTable)
    .leftJoin(vendorsTable, eq(vendorPayoutsTable.vendorId, vendorsTable.id))
    .leftJoin(vendorBankAccountsTable, eq(vendorPayoutsTable.bankAccountId, vendorBankAccountsTable.id))
    .where(!status || status === "all" ? sql`true` : eq(vendorPayoutsTable.status, status))
    .orderBy(desc(vendorPayoutsTable.createdAt))
    .limit(200);

  res.json({
    payouts: rows.map(r => ({
      ...r.payout,
      amountNgn:         parseFloat(r.payout.amountNgn),
      requestedAt:       r.payout.requestedAt.toISOString(),
      processedAt:       r.payout.processedAt?.toISOString() ?? null,
      createdAt:         r.payout.createdAt.toISOString(),
      // Flattened vendor fields
      vendorName:        r.vendor?.name ?? null,
      vendorEmail:       r.vendor?.email ?? null,
      // Flattened bank account fields
      bankAccountNumber: r.bankAcct?.accountNumber ?? null,
      bankName:          r.bankAcct?.bankName ?? null,
      accountName:       r.bankAcct?.accountName ?? null,
    })),
  });
});

router.post("/admin/payouts/:id/approve", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdminId(userId)) { res.status(403).json({ error: "Admin only" }); return; }
  const payoutId = parseInt(req.params.id);

  const [payout] = await db.select().from(vendorPayoutsTable).where(eq(vendorPayoutsTable.id, payoutId));
  if (!payout) { res.status(404).json({ error: "Payout not found" }); return; }
  if (payout.status !== "pending") { res.status(409).json({ error: `Payout is already ${payout.status}` }); return; }

  const [vendor] = await db.select({ email: vendorsTable.email, name: vendorsTable.name })
    .from(vendorsTable).where(eq(vendorsTable.id, payout.vendorId));
  const [bankAcct] = payout.bankAccountId
    ? await db.select().from(vendorBankAccountsTable).where(eq(vendorBankAccountsTable.id, payout.bankAccountId))
    : [null];

  if (!bankAcct) { res.status(400).json({ error: "No bank account linked to this payout" }); return; }

  // Deterministic reference key — stored BEFORE the external provider call so the
  // transfer.success webhook can always find this payout even if the post-call
  // DB update crashes (lookup is by providerReference OR by the PAYOUT-<id> key).
  const deterministicRef = `PAYOUT-${payoutId}`;

  // Atomic claim: only proceed if this payout is still pending; stamp the
  // deterministic reference at the same time so the row is searchable immediately.
  const claimed = await db.update(vendorPayoutsTable)
    .set({ status: "processing", providerReference: deterministicRef, updatedAt: new Date() })
    .where(and(eq(vendorPayoutsTable.id, payoutId), eq(vendorPayoutsTable.status, "pending")))
    .returning({ id: vendorPayoutsTable.id });
  if (claimed.length === 0) {
    res.status(409).json({ error: `Payout #${payoutId} is already being processed or was already completed` });
    return;
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────────
  // We never mark the payout "failed" after this point: any exception here could
  // be a network timeout that arrived after the provider accepted the transfer.
  // Leaving the payout in "processing" lets the transfer.success / transfer.failed
  // webhook (or an admin manual-reject) finalize it safely.
  let dispatchResult: Awaited<ReturnType<typeof import("../lib/payout").initiatePayout>> | null = null;
  try {
    dispatchResult = await initiatePayout(
      payout.provider as "paystack" | "interswitch" | "squad",
      parseFloat(payout.amountNgn),
      {
        bankCode:      bankAcct.bankCode,
        accountNumber: bankAcct.accountNumber,
        accountName:   bankAcct.accountName,
        paystackRecipientCode: bankAcct.paystackRecipientCode,
      },
      deterministicRef,
    );
  } catch (dispatchErr) {
    // Outcome is ambiguous — provider may or may not have accepted the transfer.
    // Do NOT mark failed or release pending hold; leave as "processing" and alert admin.
    const msg = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
    console.error(`[wallet] payout #${payoutId} dispatch error (outcome ambiguous — left processing):`, msg);
    res.status(502).json({
      error: msg,
      note: "Payout is in 'processing' state while the outcome is determined. A webhook will finalize it, or an admin can reject it manually if the transfer was never sent.",
    });
    return;
  }

  // ── Phase 2: post-dispatch persistence (transfer is in flight) ────────────────
  // Any error here MUST NOT mark the payout failed — the transfer may have been sent.
  // Leave state as "processing" and rely on webhook-driven finalization.
  try {
    // Update recipient code if Paystack created a new one (best-effort)
    if (dispatchResult.paystackRecipientCode && !bankAcct.paystackRecipientCode) {
      await db.update(vendorBankAccountsTable)
        .set({ paystackRecipientCode: dispatchResult.paystackRecipientCode })
        .where(eq(vendorBankAccountsTable.id, bankAcct.id))
        .catch(() => null);
    }

    // Stamp the actual provider reference returned (may differ from deterministicRef
    // for some providers); status stays "processing" so completePayoutSettlement's
    // claim (processing → completed) always finds the row in the expected state.
    if (dispatchResult.providerReference !== deterministicRef) {
      await db.update(vendorPayoutsTable).set({
        providerReference: dispatchResult.providerReference,
        updatedAt: new Date(),
      }).where(eq(vendorPayoutsTable.id, payoutId))
        .catch(() => null); // not fatal — webhook fallback uses deterministicRef
    }

    // For Squad/Interswitch (sync providers), settle immediately.
    // completePayoutSettlement atomically claims processing → completed + debits wallet.
    // For Paystack the transfer is async — settlement happens on transfer.success webhook.
    const settled = dispatchResult.initialStatus === "completed"
      ? await completePayoutSettlement(payout.vendorId, payoutId, parseFloat(payout.amountNgn), vendor)
      : false;

    const responseStatus = settled ? "completed" : "processing";
    res.json({ ok: true, status: responseStatus, providerReference: dispatchResult.providerReference });
  } catch (postErr) {
    // Transfer was dispatched — DO NOT fail/release. Log and return 200 so the
    // admin knows the transfer is in flight; webhook will finalize settlement.
    console.error("[wallet] approve post-dispatch persistence error (transfer may be in flight):", postErr);
    res.json({ ok: true, status: "processing", providerReference: dispatchResult.providerReference, warning: "Transfer dispatched but post-dispatch persistence partially failed; webhook will finalize." });
  }
});

router.post("/admin/payouts/:id/reject", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdminId(userId)) { res.status(403).json({ error: "Admin only" }); return; }
  const payoutId = parseInt(req.params.id);
  const { reason } = req.body as { reason?: string };

  const [payout] = await db.select().from(vendorPayoutsTable).where(eq(vendorPayoutsTable.id, payoutId));
  if (!payout) { res.status(404).json({ error: "Payout not found" }); return; }

  // Allow rejecting both pending (normal) and processing (manual resolution for
  // ambiguous dispatch failures where no webhook is expected) payouts.
  const rejectableStatuses = ["pending", "processing"];
  if (!rejectableStatuses.includes(payout.status)) {
    res.status(409).json({ error: `Cannot reject a payout with status ${payout.status}` });
    return;
  }

  const isManualResolution = payout.status === "processing";

  // Atomic: claim status transition + release pending hold in one transaction.
  // For "processing" payouts we use a guarded WHERE clause so a concurrent
  // transfer.success webhook that settles first wins and this becomes a no-op.
  let claimed = 0;
  await db.transaction(async (tx) => {
    const result = await tx.update(vendorPayoutsTable).set({
      status: "failed",
      failureReason: reason
        ? reason
        : isManualResolution
          ? "Manually resolved by admin — transfer outcome was ambiguous"
          : "Rejected by admin",
      processedAt: new Date(), updatedAt: new Date(),
    })
    .where(and(
      eq(vendorPayoutsTable.id, payoutId),
      sql`${vendorPayoutsTable.status} IN ('pending', 'processing')`,
    ))
    .returning({ id: vendorPayoutsTable.id });

    if (result.length === 0) return; // concurrent webhook already settled — no-op
    claimed = 1;

    await tx.update(vendorWalletsTable)
      .set({ pendingNgnPayout: sql`GREATEST(0, ${vendorWalletsTable.pendingNgnPayout} - ${String(payout.amountNgn)})`, updatedAt: new Date() })
      .where(eq(vendorWalletsTable.vendorId, payout.vendorId));
  });

  if (claimed === 0) {
    // Payout was already settled by a concurrent success webhook — return success so admin isn't confused.
    res.json({ ok: true, note: "Payout was concurrently settled by a success webhook; no action taken." });
    return;
  }

  // In-app notification
  await db.insert(vendorNotificationsTable).values({
    vendorId: payout.vendorId,
    type: "payout_rejected",
    message: `Your payout request of NGN ${parseFloat(payout.amountNgn).toLocaleString()} was rejected. Reason: ${reason ?? "No reason given"}`,
  }).catch(() => null);

  res.json({ ok: true });
});

// ── Admin: exchange rate & fee ────────────────────────────────────────────────

router.get("/admin/wallet-settings", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdminId(userId)) { res.status(403).json({ error: "Admin only" }); return; }
  const settings = await getWalletSettings();
  res.json(settings);
});

router.put("/admin/wallet-settings", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdminId(userId)) { res.status(403).json({ error: "Admin only" }); return; }
  const { usdToNgnRate, platformFeeRate } = req.body as { usdToNgnRate?: number; platformFeeRate?: number };
  const current = await getWalletSettings();
  const next = {
    usdToNgnRate:    usdToNgnRate    ?? current.usdToNgnRate,
    platformFeeRate: platformFeeRate ?? current.platformFeeRate,
  };
  await setSiteContentBlock("wallet.settings", next, userId, null);
  res.json({ ok: true, settings: next });
});

// ── Shared: post-payout settlement (debit wallet, create ledger entry, notify) ─

/**
 * Atomically marks a payout as completed AND debits the vendor's wallet.
 * Both happen inside one DB transaction so retries are always safe:
 * - The payout status is claimed (processing → completed) inside the tx.
 * - If the row is already "completed" the debit is skipped (idempotent).
 * - If the total deductible balance is less than amountNgn (within a 0.02 NGN
 *   tolerance) the function throws so the caller can retry rather than accepting
 *   a shortfall.
 *
 * Returns false if the payout was already settled (caller can skip notifications).
 */
export async function completePayoutSettlement(
  vendorId: number,
  payoutId: number,
  amountNgn: number,
  vendor: { email?: string | null; name?: string | null } | null | undefined,
): Promise<boolean> {
  let settled = false;
  await db.transaction(async (tx) => {
    // ── Atomic claim: payout processing|failed → completed ───────────────────
    // Also return the locked FX rate saved at request time so settlement uses
    // the rate the vendor agreed to, not the current admin-configurable rate.
    //
    // We claim both "processing" AND "failed" status to handle the recovery path:
    // a dispatch timeout can incorrectly leave a payout as "failed" even after
    // the provider accepted the transfer; when transfer.success later arrives we
    // must still settle rather than skip.
    const claimed = await tx.update(vendorPayoutsTable)
      .set({ status: "completed", processedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(vendorPayoutsTable.id, payoutId), sql`${vendorPayoutsTable.status} IN ('processing', 'failed')`) )
      .returning({ id: vendorPayoutsTable.id, lockedUsdToNgnRate: vendorPayoutsTable.lockedUsdToNgnRate });

    if (claimed.length === 0) {
      // Already completed (retried webhook) — nothing more to do.
      return;
    }

    // Use the locked rate; fall back to live rate only if snapshot is missing
    // (e.g. payouts created before this column was added).
    const usdToNgn = claimed[0].lockedUsdToNgnRate
      ? parseFloat(claimed[0].lockedUsdToNgnRate)
      : await getUsdToNgn();

    // ── Lock wallet and compute exact deduction amounts ──────────────────────
    const [wallet] = await tx.execute(
      sql`SELECT ngn_balance::numeric, usd_balance::numeric, pending_ngn_payout::numeric FROM vendor_wallets WHERE vendor_id = ${vendorId} FOR UPDATE`
    ) as unknown as [{ ngn_balance: string; usd_balance: string; pending_ngn_payout: string }];

    if (!wallet) {
      // Wallet doesn't exist — can't debit; roll back the status claim so
      // retries can try again once the wallet row is created.
      throw new Error(`[wallet] no wallet row for vendorId=${vendorId} payoutId=${payoutId}`);
    }

    const ngnBal = parseFloat(wallet.ngn_balance);
    const usdBal = parseFloat(wallet.usd_balance);

    const ngnDebit   = Math.min(amountNgn, Math.max(0, ngnBal));
    const remainder  = parseFloat((amountNgn - ngnDebit).toFixed(10));
    const usdDebit   = remainder > 0 ? Math.min(usdBal, parseFloat((remainder / usdToNgn).toFixed(10))) : 0;
    const totalNgn   = parseFloat((ngnDebit + usdDebit * usdToNgn).toFixed(2));

    // Strict invariant: refuse to settle if balance shortfall > 2 kobo
    if (amountNgn - totalNgn > 0.02) {
      throw new Error(
        `[wallet] settlement shortfall: payoutId=${payoutId} needed=${amountNgn} available=${totalNgn} — payout not finalized`
      );
    }

    await tx.update(vendorWalletsTable).set({
      ngnBalance:       sql`GREATEST(0, ${vendorWalletsTable.ngnBalance} - ${String(ngnDebit)})`,
      usdBalance:       sql`GREATEST(0, ${vendorWalletsTable.usdBalance} - ${String(usdDebit)})`,
      pendingNgnPayout: sql`GREATEST(0, ${vendorWalletsTable.pendingNgnPayout} - ${String(amountNgn)})`,
      updatedAt:        new Date(),
    }).where(eq(vendorWalletsTable.vendorId, vendorId));

    // Ledger entry — inside the same transaction as the balance deduction
    await tx.insert(walletTransactionsTable).values({
      vendorId, type: "payout", amount: String(amountNgn), currency: "NGN",
      payoutId, description: `Payout #${payoutId} to bank account`,
    });

    settled = true;
  }); // end db.transaction

  if (!settled) return false;
  // settled === true — fall through to notifications

  // In-app notification (best-effort, outside transaction)
  await db.insert(vendorNotificationsTable).values({
    vendorId, type: "payout_completed",
    message: `Your payout of NGN ${amountNgn.toLocaleString()} has been sent to your bank account.`,
  }).catch(() => null);

  // Email (best-effort)
  if (vendor?.email) {
    const html = wrapVendorEmail({ bodyHtml: `
      <h2 style="font-size:18px;margin:0 0 12px;">Payout Sent 🎉</h2>
      <p>Hi ${escapeHtml(vendor.name ?? "")},</p>
      <p>Your payout of <strong>NGN ${amountNgn.toLocaleString()}</strong> has been processed and is on its way to your bank account.</p>
      <p>Depending on your bank, it may take a few minutes to a few hours to appear.</p>
    ` });
    sendEmail({ to: vendor.email, subject: "Your payout has been sent", html }).catch(() => null);
  }
  return true;
}

export default router;
