/**
 * GenHaL Secret Accounts — dedicated virtual bank accounts for kingdoms and families.
 *
 * GET  /genhal/accounts/:unitType/:unitId            — list accounts
 * POST /genhal/accounts/:unitType/:unitId/ngn        — provision Paystack NGN dedicated account
 * POST /genhal/accounts/:unitType/:unitId/usd        — provision Squad USD virtual account
 * DELETE /genhal/accounts/:unitType/:unitId/:id      — deactivate account
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import { db, genhalSecretAccountsTable, genhalKingdomsTable, genhalFamilyAccountsTable } from "@workspace/db";
import { resolveSquadKey, squadCreateUSDVirtualAccount } from "../lib/squad";

const router = Router();
const PAYSTACK_BASE = "https://api.paystack.co";

// ── helpers ───────────────────────────────────────────────────────────────────

function resolvePaystackKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Paystack is not configured.");
  return key;
}

async function paystackPost<T = unknown>(path: string, secretKey: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json() as { status: boolean; message?: string; data: T };
  if (!json.status) throw new Error(json.message ?? "Paystack error");
  return json.data;
}

type UnitType = "kingdom" | "family";

async function resolveUnitName(unitType: UnitType, unitId: number): Promise<string | null> {
  if (unitType === "kingdom") {
    const [k] = await db.select({ name: genhalKingdomsTable.name })
      .from(genhalKingdomsTable).where(eq(genhalKingdomsTable.id, unitId)).limit(1);
    return k?.name ?? null;
  }
  const [f] = await db.select({ name: genhalFamilyAccountsTable.name })
    .from(genhalFamilyAccountsTable).where(eq(genhalFamilyAccountsTable.id, unitId)).limit(1);
  return f?.name ?? null;
}

function requireAuth(req: import("express").Request, res: import("express").Response): string | null {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  return userId;
}

function validateUnitType(unitType: string, res: import("express").Response): UnitType | null {
  if (unitType !== "kingdom" && unitType !== "family") {
    res.status(400).json({ error: "unitType must be 'kingdom' or 'family'" });
    return null;
  }
  return unitType as UnitType;
}

// ── GET /genhal/accounts/:unitType/:unitId ────────────────────────────────────

router.get("/genhal/accounts/:unitType/:unitId", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res); if (!userId) return;
  const unitType = validateUnitType(req.params.unitType, res); if (!unitType) return;
  const unitId = Number(req.params.unitId);
  if (isNaN(unitId)) { res.status(400).json({ error: "Invalid unitId" }); return; }

  try {
    const accounts = await db.select().from(genhalSecretAccountsTable)
      .where(and(
        eq(genhalSecretAccountsTable.unitType, unitType),
        eq(genhalSecretAccountsTable.unitId, unitId),
        eq(genhalSecretAccountsTable.isActive, true),
      ));
    // Mask account number by default — full number returned; frontend decides visibility
    res.json(accounts);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed";
    res.status(500).json({ error: msg });
  }
});

// ── POST /genhal/accounts/:unitType/:unitId/ngn ───────────────────────────────
// Provisions a Paystack dedicated NGN virtual account.

router.post("/genhal/accounts/:unitType/:unitId/ngn", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res); if (!userId) return;
  const unitType = validateUnitType(req.params.unitType, res); if (!unitType) return;
  const unitId = Number(req.params.unitId);
  if (isNaN(unitId)) { res.status(400).json({ error: "Invalid unitId" }); return; }

  const { firstName, lastName, email, phone, preferredBank } = req.body as {
    firstName: string; lastName: string; email: string; phone?: string; preferredBank?: string;
  };
  if (!firstName || !lastName || !email) {
    res.status(400).json({ error: "firstName, lastName, and email are required" }); return;
  }

  // Only one active NGN account per unit
  const [existing] = await db.select({ id: genhalSecretAccountsTable.id })
    .from(genhalSecretAccountsTable)
    .where(and(
      eq(genhalSecretAccountsTable.unitType, unitType),
      eq(genhalSecretAccountsTable.unitId, unitId),
      eq(genhalSecretAccountsTable.currency, "NGN"),
      eq(genhalSecretAccountsTable.isActive, true),
    )).limit(1);
  if (existing) { res.status(409).json({ error: "This unit already has an active NGN account." }); return; }

  let secretKey: string;
  try { secretKey = resolvePaystackKey(); }
  catch { res.status(503).json({ error: "Paystack is not configured." }); return; }

  try {
    // Step 1: create or find Paystack customer
    const customer = await paystackPost<{ customer_code: string; email: string }>(
      "/customer",
      secretKey,
      { email, first_name: firstName, last_name: lastName, phone: phone ?? "" },
    ).catch(async () => {
      // Customer might already exist — fetch by email
      const fetchRes = await fetch(`${PAYSTACK_BASE}/customer/${encodeURIComponent(email)}`, {
        headers: { "Authorization": `Bearer ${secretKey}` },
      });
      const json = await fetchRes.json() as { status: boolean; data: { customer_code: string; email: string } };
      if (!json.status) throw new Error("Failed to create or fetch Paystack customer");
      return json.data;
    });

    // Step 2: create dedicated virtual account
    const bank = preferredBank ?? "wema-bank";
    const dvAccount = await paystackPost<{
      account_number: string;
      account_name: string;
      bank: { name: string; slug: string; id: number };
      customer: { customer_code: string };
    }>(
      "/dedicated_account",
      secretKey,
      { customer: customer.customer_code, preferred_bank: bank },
    );

    const unitName = await resolveUnitName(unitType, unitId) ?? `${firstName} ${lastName}`;

    const [row] = await db.insert(genhalSecretAccountsTable).values({
      unitType,
      unitId,
      currency:             "NGN",
      provider:             "paystack",
      accountNumber:        dvAccount.account_number,
      accountName:          dvAccount.account_name || unitName,
      bankName:             dvAccount.bank.name,
      bankCode:             dvAccount.bank.slug,
      customerIdentifier:   customer.customer_code,
      isActive:             true,
      rawResponse:          dvAccount as unknown as Record<string, unknown>,
      createdByClerkUserId: userId,
    }).returning();

    res.status(201).json(row);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to provision NGN account";
    res.status(502).json({ error: msg });
  }
});

// ── POST /genhal/accounts/:unitType/:unitId/usd ───────────────────────────────
// Provisions a Squad USD virtual account.

router.post("/genhal/accounts/:unitType/:unitId/usd", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res); if (!userId) return;
  const unitType = validateUnitType(req.params.unitType, res); if (!unitType) return;
  const unitId = Number(req.params.unitId);
  if (isNaN(unitId)) { res.status(400).json({ error: "Invalid unitId" }); return; }

  const { firstName, lastName, email, phone } = req.body as {
    firstName: string; lastName: string; email: string; phone?: string;
  };
  if (!firstName || !lastName || !email) {
    res.status(400).json({ error: "firstName, lastName, and email are required" }); return;
  }

  // Only one active USD account per unit
  const [existing] = await db.select({ id: genhalSecretAccountsTable.id })
    .from(genhalSecretAccountsTable)
    .where(and(
      eq(genhalSecretAccountsTable.unitType, unitType),
      eq(genhalSecretAccountsTable.unitId, unitId),
      eq(genhalSecretAccountsTable.currency, "USD"),
      eq(genhalSecretAccountsTable.isActive, true),
    )).limit(1);
  if (existing) { res.status(409).json({ error: "This unit already has an active USD account." }); return; }

  let secretKey: string;
  try { secretKey = await resolveSquadKey(); }
  catch { res.status(503).json({ error: "Squad is not configured." }); return; }

  const customerIdentifier = `genhal-${unitType}-${unitId}-usd`;

  try {
    const result = await squadCreateUSDVirtualAccount(secretKey, {
      customerIdentifier,
      firstName,
      lastName,
      mobileNumber: phone ?? "00000000000",
      email,
    });

    const data = result.data;
    const unitName = await resolveUnitName(unitType, unitId) ?? `${firstName} ${lastName}`;

    const [row] = await db.insert(genhalSecretAccountsTable).values({
      unitType,
      unitId,
      currency:             "USD",
      provider:             "squad",
      accountNumber:        data.virtual_account_number,
      accountName:          data.beneficiary_name || unitName,
      bankName:             data.bank_name,
      routingNumber:        data.routing_number ?? null,
      customerIdentifier,
      isActive:             true,
      rawResponse:          data as unknown as Record<string, unknown>,
      createdByClerkUserId: userId,
    }).returning();

    res.status(201).json(row);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to provision USD account";
    res.status(502).json({ error: msg });
  }
});

// ── DELETE /genhal/accounts/:unitType/:unitId/:id ─────────────────────────────

router.delete("/genhal/accounts/:unitType/:unitId/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res); if (!userId) return;
  const accountId = Number(req.params.id);
  if (isNaN(accountId)) { res.status(400).json({ error: "Invalid account id" }); return; }

  await db.update(genhalSecretAccountsTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(genhalSecretAccountsTable.id, accountId));

  res.json({ success: true });
});

export default router;
