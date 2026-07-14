import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, investmentsTable, vendorsTable } from "@workspace/db";
import {
  ListInvestmentsQueryParams,
  CreateInvestmentBody,
  UpdateInvestmentParams,
  UpdateInvestmentBody,
  DeleteInvestmentParams,
  ListInvestmentsResponse,
  CreateInvestmentResponse,
  UpdateInvestmentResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

async function resolveOwnedVendorId(req: import("express").Request, requestedVendorId: number): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { userId } = getAuth(req);
  if (!userId) return { ok: false, status: 401, error: "Unauthorized" };
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, requestedVendorId));
  if (!vendor) return { ok: false, status: 404, error: "Vendor not found" };
  if (vendor.clerkUserId !== userId && !isAdmin(userId)) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true };
}

function serializeInvestment(i: typeof investmentsTable.$inferSelect) {
  return {
    ...i,
    amount: parseFloat(i.amount),
    currentValue: i.currentValue ? parseFloat(i.currentValue) : null,
    investmentDate: i.investmentDate.toISOString(),
    createdAt: i.createdAt.toISOString(),
  };
}

router.get("/investments", async (req, res): Promise<void> => {
  const params = ListInvestmentsQueryParams.safeParse(req.query);
  if (!params.success || !params.data.vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }
  const check = await resolveOwnedVendorId(req, params.data.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const conditions = [eq(investmentsTable.vendorId, params.data.vendorId)];
  if (params.data.type) conditions.push(eq(investmentsTable.type, params.data.type));
  if (params.data.status) conditions.push(eq(investmentsTable.status, params.data.status));
  if (params.data.branchId) conditions.push(eq(investmentsTable.branchId, params.data.branchId));
  if (params.data.workerId) conditions.push(eq(investmentsTable.workerId, params.data.workerId));

  const investments = await db.select().from(investmentsTable).where(and(...conditions)).orderBy(desc(investmentsTable.investmentDate));
  res.json(ListInvestmentsResponse.parse(investments.map(serializeInvestment)));
});

router.post("/investments", async (req, res): Promise<void> => {
  const parsed = CreateInvestmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const check = await resolveOwnedVendorId(req, parsed.data.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const { amount, currentValue, investmentDate, ...rest } = parsed.data;
  const [investment] = await db.insert(investmentsTable).values({
    ...rest,
    amount: amount.toString(),
    ...(currentValue !== undefined ? { currentValue: currentValue.toString() } : {}),
    ...(investmentDate ? { investmentDate: new Date(investmentDate) } : {}),
  }).returning();
  res.status(201).json(CreateInvestmentResponse.parse(serializeInvestment(investment)));
});

router.get("/investments/export", async (req, res): Promise<void> => {
  const vendorId = Number(req.query.vendorId);
  if (isNaN(vendorId)) { res.status(400).json({ error: "vendorId is required" }); return; }
  const check = await resolveOwnedVendorId(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const exportConditions = [eq(investmentsTable.vendorId, vendorId)];
  if (req.query.branchId) {
    const b = Number(req.query.branchId);
    if (!isNaN(b)) exportConditions.push(eq(investmentsTable.branchId, b));
  }
  if (req.query.workerId) {
    const w = Number(req.query.workerId);
    if (!isNaN(w)) exportConditions.push(eq(investmentsTable.workerId, w));
  }
  if (req.query.status) exportConditions.push(eq(investmentsTable.status, String(req.query.status)));
  const investments = await db.select().from(investmentsTable).where(and(...exportConditions)).orderBy(desc(investmentsTable.investmentDate));

  const HEADERS = ["ID", "Type", "Name", "Amount", "Current Value", "Currency", "Status", "Investment Date"];
  function csvCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  const filename = `investments-export-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.write(HEADERS.join(",") + "\r\n");
  for (const i of investments) {
    res.write([i.id, i.type, i.name, i.amount, i.currentValue, i.currency, i.status, i.investmentDate.toISOString()].map(csvCell).join(",") + "\r\n");
  }
  res.end();
});

router.patch("/investments/:id", async (req, res): Promise<void> => {
  const params = UpdateInvestmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateInvestmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(investmentsTable).where(eq(investmentsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Investment not found" }); return; }
  const check = await resolveOwnedVendorId(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const { amount, currentValue, investmentDate, ...rest } = parsed.data;
  const updateData = {
    ...rest,
    ...(amount !== undefined ? { amount: amount.toString() } : {}),
    ...(currentValue !== undefined ? { currentValue: currentValue.toString() } : {}),
    ...(investmentDate !== undefined ? { investmentDate: new Date(investmentDate) } : {}),
  };
  const [investment] = await db.update(investmentsTable).set(updateData).where(eq(investmentsTable.id, params.data.id)).returning();
  res.json(UpdateInvestmentResponse.parse(serializeInvestment(investment)));
});

router.delete("/investments/:id", async (req, res): Promise<void> => {
  const params = DeleteInvestmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(investmentsTable).where(eq(investmentsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Investment not found" }); return; }
  const check = await resolveOwnedVendorId(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  await db.delete(investmentsTable).where(eq(investmentsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
