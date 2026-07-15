import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc, asc, gt } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, salesTable, vendorsTable } from "@workspace/db";
import {
  ListSalesQueryParams,
  CreateSaleBody,
  UpdateSaleParams,
  UpdateSaleBody,
  DeleteSaleParams,
  ListSalesResponse,
  CreateSaleResponse,
  UpdateSaleResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

/** Resolves the authed vendor and rejects if req/query vendorId doesn't match (unless admin). */
async function resolveOwnedVendorId(req: import("express").Request, requestedVendorId: number): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { userId } = getAuth(req);
  if (!userId) return { ok: false, status: 401, error: "Unauthorized" };
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, requestedVendorId));
  if (!vendor) return { ok: false, status: 404, error: "Vendor not found" };
  if (vendor.clerkUserId !== userId && !isAdmin(userId)) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true };
}

function serializeSale(s: typeof salesTable.$inferSelect) {
  return {
    ...s,
    amount: parseFloat(s.amount),
    saleDate: s.saleDate.toISOString(),
    createdAt: s.createdAt.toISOString(),
  };
}

router.get("/sales", async (req, res): Promise<void> => {
  const params = ListSalesQueryParams.safeParse(req.query);
  if (!params.success || !params.data.vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }
  const check = await resolveOwnedVendorId(req, params.data.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const conditions = [eq(salesTable.vendorId, params.data.vendorId)];
  if (params.data.source) conditions.push(eq(salesTable.source, params.data.source));
  if (params.data.branchId) conditions.push(eq(salesTable.branchId, params.data.branchId));
  if (params.data.workerId) conditions.push(eq(salesTable.workerId, params.data.workerId));
  if (params.data.from) {
    const d = new Date(params.data.from);
    if (!isNaN(d.getTime())) conditions.push(gte(salesTable.saleDate, d));
  }
  if (params.data.to) {
    const d = new Date(params.data.to);
    if (!isNaN(d.getTime())) conditions.push(lte(salesTable.saleDate, d));
  }

  const sales = await db.select().from(salesTable).where(and(...conditions)).orderBy(desc(salesTable.saleDate));
  res.json(ListSalesResponse.parse(sales.map(serializeSale)));
});

router.post("/sales", async (req, res): Promise<void> => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const check = await resolveOwnedVendorId(req, parsed.data.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const { amount, saleDate, ...rest } = parsed.data;
  const [sale] = await db.insert(salesTable).values({
    ...rest,
    source: "manual",
    amount: amount.toString(),
    ...(saleDate ? { saleDate: new Date(saleDate) } : {}),
  }).returning();
  res.status(201).json(CreateSaleResponse.parse(serializeSale(sale)));
});

router.get("/sales/export", async (req, res): Promise<void> => {
  const vendorId = Number(req.query.vendorId);
  if (isNaN(vendorId)) { res.status(400).json({ error: "vendorId is required" }); return; }
  const check = await resolveOwnedVendorId(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const conditions = [eq(salesTable.vendorId, vendorId)];
  if (req.query.branchId) {
    const b = Number(req.query.branchId);
    if (!isNaN(b)) conditions.push(eq(salesTable.branchId, b));
  }
  if (req.query.workerId) {
    const w = Number(req.query.workerId);
    if (!isNaN(w)) conditions.push(eq(salesTable.workerId, w));
  }
  if (req.query.from) {
    const d = new Date(String(req.query.from));
    if (!isNaN(d.getTime())) conditions.push(gte(salesTable.saleDate, d));
  }
  if (req.query.to) {
    const d = new Date(String(req.query.to));
    if (!isNaN(d.getTime())) conditions.push(lte(salesTable.saleDate, d));
  }
  const HEADERS = ["ID", "Source", "Description", "Customer", "Amount", "Currency", "Sale Date"];
  function csvCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  const filename = `sales-export-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.write(HEADERS.join(",") + "\r\n");

  // Stream sales in fixed-size batches ordered by a stable, indexed key (id)
  // so memory usage stays constant regardless of history size — mirrors the
  // admin vendor export's batching pattern.
  const BATCH_SIZE = 500;
  let lastId = 0;
  while (true) {
    const batch = await db
      .select()
      .from(salesTable)
      .where(and(...conditions, gt(salesTable.id, lastId)))
      .orderBy(asc(salesTable.id))
      .limit(BATCH_SIZE);
    if (batch.length === 0) break;

    let chunk = "";
    for (const s of batch) {
      chunk += [s.id, s.source, s.description, s.customerName, s.amount, s.currency, s.saleDate.toISOString()].map(csvCell).join(",") + "\r\n";
    }
    res.write(chunk);

    lastId = batch[batch.length - 1]!.id;
    if (batch.length < BATCH_SIZE) break;
  }
  res.end();
});

router.patch("/sales/:id", async (req, res): Promise<void> => {
  const params = UpdateSaleParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateSaleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(salesTable).where(eq(salesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Sale not found" }); return; }
  const check = await resolveOwnedVendorId(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  if (existing.source !== "manual") { res.status(400).json({ error: "Auto-synced sales cannot be edited" }); return; }

  const { amount, saleDate, ...rest } = parsed.data;
  const updateData = {
    ...rest,
    ...(amount !== undefined ? { amount: amount.toString() } : {}),
    ...(saleDate !== undefined ? { saleDate: new Date(saleDate) } : {}),
  };
  const [sale] = await db.update(salesTable).set(updateData).where(eq(salesTable.id, params.data.id)).returning();
  res.json(UpdateSaleResponse.parse(serializeSale(sale)));
});

router.delete("/sales/:id", async (req, res): Promise<void> => {
  const params = DeleteSaleParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(salesTable).where(eq(salesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Sale not found" }); return; }
  const check = await resolveOwnedVendorId(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  if (existing.source !== "manual") { res.status(400).json({ error: "Auto-synced sales cannot be deleted" }); return; }

  await db.delete(salesTable).where(eq(salesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
