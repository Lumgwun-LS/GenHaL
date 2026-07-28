/**
 * Vendor & customer virtual account management.
 *
 * POST /vendor-virtual-accounts/squad-dedicated     — assign Squad dedicated NGN account to vendor
 * POST /vendor-virtual-accounts/squad-usd           — assign Squad USD virtual account to vendor
 * POST /vendor-virtual-accounts/squad-dynamic       — create one-time Squad virtual account
 * POST /vendor-virtual-accounts/interswitch         — assign Interswitch virtual account to vendor
 * GET  /vendor-virtual-accounts                     — list vendor's virtual accounts
 * DELETE /vendor-virtual-accounts/:id               — deactivate a virtual account
 *
 * POST /customer-virtual-accounts/squad             — assign Squad virtual account to a customer
 * POST /customer-virtual-accounts/interswitch       — assign Interswitch virtual account to a customer
 * GET  /customer-virtual-accounts                   — list customer's virtual accounts
 *
 * POST /payments/verify-account                     — resolve bank account name (Squad or IS)
 * GET  /payments/banks                              — list banks (Squad)
 * POST /payments/verify-bvn                        — BVN lookup (Squad or IS)
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import { db, vendorsTable, vendorVirtualAccountsTable, customerVirtualAccountsTable, customersTable } from "@workspace/db";
import {
  resolveSquadKey, squadCreateDedicatedVirtualAccount, squadCreateUSDVirtualAccount,
  squadCreateDynamicVirtualAccount, squadListBanks, squadVerifyBankAccount, squadVerifyBVN,
} from "../lib/squad";
import {
  interswitchCreateVirtualAccount,
  interswitchVerifyAccount, interswitchVerifyBVN,
} from "../lib/interswitch";
import { resolveInterswitchCreds as resolveISCreds } from "../lib/vendor-keys";

const router = Router();

// ── Auth helpers ──────────────────────────────────────────────────────────────

function isAdminId(userId: string) {
  return (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean).includes(userId);
}

async function requireVendor(req: import("express").Request, res: import("express").Response) {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const [v] = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId)).limit(1);
  if (!v && !isAdminId(userId)) { res.status(403).json({ error: "Vendor account not found" }); return null; }
  return v ?? null;
}

// ══════════════════════════════════════════════════════════════════════════════
// VENDOR VIRTUAL ACCOUNTS
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /vendor-virtual-accounts/squad-dedicated ────────────────────────────
// Creates a permanent dedicated NGN bank account for the vendor via Squad.

router.post("/vendor-virtual-accounts/squad-dedicated", async (req, res): Promise<void> => {
  const vendor = await requireVendor(req, res); if (vendor === null) return;

  const { firstName, lastName, mobileNumber, email, bvn, dob, address, gender } = req.body as {
    firstName: string; lastName: string; mobileNumber: string; email: string;
    bvn: string; dob: string; address: string; gender: "1" | "2";
  };
  const missing = ["firstName","lastName","mobileNumber","email","bvn","dob","address","gender"].filter(k => !(req.body as Record<string,string>)[k]);
  if (missing.length) { res.status(400).json({ error: `Missing: ${missing.join(", ")}` }); return; }

  const secretKey = await resolveSquadKey();
  const customerIdentifier = `vendor-${vendor.id}`;

  const result = await squadCreateDedicatedVirtualAccount(secretKey, {
    customerIdentifier, firstName, lastName, mobileNumber, email, bvn, dob, address, gender,
  });

  const [saved] = await db.insert(vendorVirtualAccountsTable).values({
    vendorId:      vendor.id,
    gateway:       "squad",
    accountNumber: result.data.virtual_account_number,
    bankName:      result.data.bank_name,
    accountName:   result.data.beneficiary_name,
    currency:      "NGN",
    type:          "dedicated",
    referenceCode: result.data.customer_identifier,
    metadata:      result.data as Record<string, unknown>,
  }).onConflictDoNothing().returning();

  res.status(201).json({ virtualAccount: saved ?? result.data });
});

// ── POST /vendor-virtual-accounts/squad-usd ──────────────────────────────────

router.post("/vendor-virtual-accounts/squad-usd", async (req, res): Promise<void> => {
  const vendor = await requireVendor(req, res); if (vendor === null) return;

  const { firstName, lastName, mobileNumber, email } = req.body as {
    firstName: string; lastName: string; mobileNumber: string; email: string;
  };
  if (!firstName || !lastName || !mobileNumber || !email) {
    res.status(400).json({ error: "firstName, lastName, mobileNumber and email are required" }); return;
  }

  const secretKey = await resolveSquadKey();
  const result = await squadCreateUSDVirtualAccount(secretKey, {
    customerIdentifier: `vendor-${vendor.id}-usd`, firstName, lastName, mobileNumber, email,
  });

  const [saved] = await db.insert(vendorVirtualAccountsTable).values({
    vendorId:      vendor.id,
    gateway:       "squad",
    accountNumber: result.data.virtual_account_number,
    bankName:      result.data.bank_name,
    accountName:   result.data.beneficiary_name,
    currency:      "USD",
    type:          "dedicated",
    referenceCode: `vendor-${vendor.id}-usd`,
    metadata:      { routingNumber: result.data.routing_number } as Record<string, unknown>,
  }).returning();

  res.status(201).json({ virtualAccount: saved });
});

// ── POST /vendor-virtual-accounts/squad-dynamic ──────────────────────────────

router.post("/vendor-virtual-accounts/squad-dynamic", async (req, res): Promise<void> => {
  const vendor = await requireVendor(req, res); if (vendor === null) return;

  const { amount, expiredDate, callbackUrl, isSingleUse } = req.body;
  const secretKey = await resolveSquadKey();
  const result = await squadCreateDynamicVirtualAccount(secretKey, {
    customerIdentifier: `vendor-${vendor.id}-${Date.now()}`, amount, expiredDate, callbackUrl, isSingleUse,
  });

  const [saved] = await db.insert(vendorVirtualAccountsTable).values({
    vendorId:      vendor.id,
    gateway:       "squad",
    accountNumber: result.data.virtual_account_number,
    bankName:      result.data.bank_name,
    accountName:   result.data.beneficiary_name,
    currency:      "NGN",
    type:          "dynamic",
    referenceCode: `vendor-${vendor.id}-${Date.now()}`,
    metadata:      result.data as Record<string, unknown>,
  }).returning();

  res.status(201).json({ virtualAccount: saved });
});

// ── POST /vendor-virtual-accounts/interswitch ────────────────────────────────

router.post("/vendor-virtual-accounts/interswitch", async (req, res): Promise<void> => {
  const vendor = await requireVendor(req, res); if (vendor === null) return;

  const { phoneNumber, lastName, otherNames, email, bvn } = req.body as {
    phoneNumber: string; lastName: string; otherNames: string; email?: string; bvn?: string;
  };
  if (!phoneNumber || !lastName || !otherNames) {
    res.status(400).json({ error: "phoneNumber, lastName and otherNames are required" }); return;
  }

  const creds = await resolveISCreds();
  const result = await interswitchCreateVirtualAccount(creds, { phoneNumber, lastName, otherNames, email, bvn });

  const [saved] = await db.insert(vendorVirtualAccountsTable).values({
    vendorId:      vendor.id,
    gateway:       "interswitch",
    accountNumber: result.accountNumber,
    bankCode:      result.bankCode,
    bankName:      result.bankName,
    accountName:   result.accountName,
    currency:      "NGN",
    type:          "dedicated",
    referenceCode: result.walletId,
    metadata:      { walletId: result.walletId } as Record<string, unknown>,
  }).returning();

  res.status(201).json({ virtualAccount: saved });
});

// ── GET /vendor-virtual-accounts ─────────────────────────────────────────────

router.get("/vendor-virtual-accounts", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId)).limit(1);
  if (!vendor) { res.status(403).json({ error: "Vendor not found" }); return; }

  const accounts = await db.select().from(vendorVirtualAccountsTable)
    .where(and(eq(vendorVirtualAccountsTable.vendorId, vendor.id), eq(vendorVirtualAccountsTable.isActive, true)))
    .orderBy(vendorVirtualAccountsTable.createdAt);

  res.json({ accounts: accounts.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })) });
});

// ── DELETE /vendor-virtual-accounts/:id ──────────────────────────────────────

router.delete("/vendor-virtual-accounts/:id", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId)).limit(1);
  if (!vendor) { res.status(403).json({ error: "Vendor not found" }); return; }

  const id = parseInt(req.params.id);
  await db.update(vendorVirtualAccountsTable).set({ isActive: false })
    .where(and(eq(vendorVirtualAccountsTable.id, id), eq(vendorVirtualAccountsTable.vendorId, vendor.id)));
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOMER VIRTUAL ACCOUNTS
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /customer-virtual-accounts/squad ────────────────────────────────────

router.post("/customer-virtual-accounts/squad", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [customer] = await db.select({ id: customersTable.id, email: customersTable.email, name: customersTable.name })
    .from(customersTable).where(eq(customersTable.clerkUserId, userId)).limit(1);
  if (!customer) { res.status(403).json({ error: "Customer account not found" }); return; }

  const { firstName, lastName, mobileNumber, currency = "NGN" } = req.body as {
    firstName: string; lastName: string; mobileNumber: string; currency?: string;
  };
  if (!firstName || !lastName || !mobileNumber) {
    res.status(400).json({ error: "firstName, lastName and mobileNumber are required" }); return;
  }

  const secretKey = await resolveSquadKey();
  let result: { data: { virtual_account_number: string; bank_name: string; beneficiary_name: string; routing_number?: string } };

  if (currency === "USD") {
    result = await squadCreateUSDVirtualAccount(secretKey, {
      customerIdentifier: `customer-${customer.id}-usd`, firstName, lastName, mobileNumber, email: customer.email,
    });
  } else {
    result = await squadCreateDynamicVirtualAccount(secretKey, { customerIdentifier: `customer-${customer.id}` });
  }

  const [saved] = await db.insert(customerVirtualAccountsTable).values({
    customerId:    customer.id,
    customerEmail: customer.email,
    gateway:       "squad",
    accountNumber: result.data.virtual_account_number,
    bankName:      result.data.bank_name,
    accountName:   result.data.beneficiary_name,
    currency,
    type:          "dedicated",
    referenceCode: `customer-${customer.id}${currency === "USD" ? "-usd" : ""}`,
    metadata:      { routingNumber: (result.data as { routing_number?: string }).routing_number } as Record<string, unknown>,
  }).returning();

  res.status(201).json({ virtualAccount: saved });
});

// ── POST /customer-virtual-accounts/interswitch ──────────────────────────────

router.post("/customer-virtual-accounts/interswitch", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [customer] = await db.select({ id: customersTable.id, email: customersTable.email, name: customersTable.name })
    .from(customersTable).where(eq(customersTable.clerkUserId, userId)).limit(1);
  if (!customer) { res.status(403).json({ error: "Customer account not found" }); return; }

  const { phoneNumber, bvn } = req.body as { phoneNumber: string; bvn?: string };
  if (!phoneNumber) { res.status(400).json({ error: "phoneNumber is required" }); return; }

  const nameParts = (customer.name ?? "Customer").split(" ");
  const creds = await resolveISCreds();
  const result = await interswitchCreateVirtualAccount(creds, {
    phoneNumber, lastName: nameParts[nameParts.length - 1] ?? "User",
    otherNames: (nameParts.slice(0, -1).join(" ") || nameParts[0]) ?? "Awa",
    email: customer.email, bvn,
  });

  const [saved] = await db.insert(customerVirtualAccountsTable).values({
    customerId:    customer.id,
    customerEmail: customer.email,
    gateway:       "interswitch",
    accountNumber: result.accountNumber,
    bankCode:      result.bankCode,
    bankName:      result.bankName,
    accountName:   result.accountName,
    currency:      "NGN",
    type:          "dedicated",
    referenceCode: result.walletId,
    metadata:      { walletId: result.walletId } as Record<string, unknown>,
  }).returning();

  res.status(201).json({ virtualAccount: saved });
});

// ── GET /customer-virtual-accounts ───────────────────────────────────────────

router.get("/customer-virtual-accounts", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [customer] = await db.select({ id: customersTable.id })
    .from(customersTable).where(eq(customersTable.clerkUserId, userId)).limit(1);
  if (!customer) { res.status(403).json({ error: "Customer account not found" }); return; }

  const accounts = await db.select().from(customerVirtualAccountsTable)
    .where(and(eq(customerVirtualAccountsTable.customerId, customer.id), eq(customerVirtualAccountsTable.isActive, true)));
  res.json({ accounts: accounts.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })) });
});

// ══════════════════════════════════════════════════════════════════════════════
// SHARED UTILITY ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /payments/verify-account ────────────────────────────────────────────

router.post("/payments/verify-account", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { gateway = "squad", bankCode, accountNumber } = req.body as {
    gateway?: "squad" | "interswitch"; bankCode: string; accountNumber: string;
  };
  if (!bankCode || !accountNumber) { res.status(400).json({ error: "bankCode and accountNumber are required" }); return; }

  if (gateway === "interswitch") {
    const creds = await resolveISCreds();
    const result = await interswitchVerifyAccount(creds, { bankCode, accountNumber });
    res.json({ accountName: result.accountName, accountNumber: result.accountNumber, bankCode: result.bankCode });
    return;
  }

  const secretKey = await resolveSquadKey();
  const result = await squadVerifyBankAccount(secretKey, { bank_code: bankCode, account_number: accountNumber });
  res.json({ accountName: result.data.account_name, accountNumber: result.data.account_number, bankCode: result.data.bank_code });
});

// ── GET /payments/banks ───────────────────────────────────────────────────────

router.get("/payments/banks", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const secretKey = await resolveSquadKey();
  const result = await squadListBanks(secretKey);
  res.json({ banks: result.data });
});

// ── POST /payments/verify-bvn ─────────────────────────────────────────────────

router.post("/payments/verify-bvn", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { gateway = "squad", bvn, ...rest } = req.body as { gateway?: "squad" | "interswitch"; bvn: string; [key: string]: unknown };
  if (!bvn) { res.status(400).json({ error: "bvn is required" }); return; }

  if (gateway === "interswitch") {
    const creds = await resolveISCreds();
    const result = await interswitchVerifyBVN(creds, bvn);
    res.json(result);
    return;
  }

  const secretKey = await resolveSquadKey();
  const result = await squadVerifyBVN(secretKey, { bvn, ...(rest as Record<string, string>) });
  res.json(result.data);
});

export default router;
