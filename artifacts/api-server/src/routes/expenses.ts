import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, expensesTable, vendorsTable } from "@workspace/db";
import { computeNextOccurrenceDate } from "../lib/recurring-expenses";
import {
  ListExpensesQueryParams,
  CreateExpenseBody,
  UpdateExpenseParams,
  UpdateExpenseBody,
  DeleteExpenseParams,
  ListExpensesResponse,
  CreateExpenseResponse,
  UpdateExpenseResponse,
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

function serializeExpense(e: typeof expensesTable.$inferSelect) {
  return {
    ...e,
    amount: parseFloat(e.amount),
    expenseDate: e.expenseDate.toISOString(),
    createdAt: e.createdAt.toISOString(),
    nextOccurrenceDate: e.nextOccurrenceDate ? e.nextOccurrenceDate.toISOString() : null,
  };
}

router.get("/expenses", async (req, res): Promise<void> => {
  const params = ListExpensesQueryParams.safeParse(req.query);
  if (!params.success || !params.data.vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }
  const check = await resolveOwnedVendorId(req, params.data.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const conditions = [eq(expensesTable.vendorId, params.data.vendorId)];
  if (params.data.category) conditions.push(eq(expensesTable.category, params.data.category));
  if (params.data.branchId) conditions.push(eq(expensesTable.branchId, params.data.branchId));
  if (params.data.workerId) conditions.push(eq(expensesTable.workerId, params.data.workerId));
  if (params.data.from) {
    const d = new Date(params.data.from);
    if (!isNaN(d.getTime())) conditions.push(gte(expensesTable.expenseDate, d));
  }
  if (params.data.to) {
    const d = new Date(params.data.to);
    if (!isNaN(d.getTime())) conditions.push(lte(expensesTable.expenseDate, d));
  }

  const expenses = await db.select().from(expensesTable).where(and(...conditions)).orderBy(desc(expensesTable.expenseDate));
  res.json(ListExpensesResponse.parse(expenses.map(serializeExpense)));
});

router.post("/expenses", async (req, res): Promise<void> => {
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const check = await resolveOwnedVendorId(req, parsed.data.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  if (parsed.data.isRecurring && !parsed.data.recurringFrequency) {
    res.status(400).json({ error: "recurringFrequency is required when isRecurring is true" });
    return;
  }

  const { amount, expenseDate, isRecurring, recurringFrequency, ...rest } = parsed.data;
  const resolvedExpenseDate = expenseDate ? new Date(expenseDate) : new Date();
  const [expense] = await db.insert(expensesTable).values({
    ...rest,
    amount: amount.toString(),
    expenseDate: resolvedExpenseDate,
    isRecurring: isRecurring ?? false,
    ...(isRecurring && recurringFrequency
      ? {
          recurringFrequency,
          nextOccurrenceDate: computeNextOccurrenceDate(resolvedExpenseDate, recurringFrequency),
        }
      : {}),
  }).returning();
  res.status(201).json(CreateExpenseResponse.parse(serializeExpense(expense)));
});

router.get("/expenses/export", async (req, res): Promise<void> => {
  const vendorId = Number(req.query.vendorId);
  if (isNaN(vendorId)) { res.status(400).json({ error: "vendorId is required" }); return; }
  const check = await resolveOwnedVendorId(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const conditions = [eq(expensesTable.vendorId, vendorId)];
  if (req.query.branchId) {
    const b = Number(req.query.branchId);
    if (!isNaN(b)) conditions.push(eq(expensesTable.branchId, b));
  }
  if (req.query.workerId) {
    const w = Number(req.query.workerId);
    if (!isNaN(w)) conditions.push(eq(expensesTable.workerId, w));
  }
  if (req.query.from) {
    const d = new Date(String(req.query.from));
    if (!isNaN(d.getTime())) conditions.push(gte(expensesTable.expenseDate, d));
  }
  if (req.query.to) {
    const d = new Date(String(req.query.to));
    if (!isNaN(d.getTime())) conditions.push(lte(expensesTable.expenseDate, d));
  }
  const expenses = await db.select().from(expensesTable).where(and(...conditions)).orderBy(desc(expensesTable.expenseDate));

  const HEADERS = ["ID", "Category", "Description", "Amount", "Currency", "Expense Date"];
  function csvCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
  const filename = `expenses-export-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.write(HEADERS.join(",") + "\r\n");
  for (const e of expenses) {
    res.write([e.id, e.category, e.description, e.amount, e.currency, e.expenseDate.toISOString()].map(csvCell).join(",") + "\r\n");
  }
  res.end();
});

router.patch("/expenses/:id", async (req, res): Promise<void> => {
  const params = UpdateExpenseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateExpenseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(expensesTable).where(eq(expensesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Expense not found" }); return; }
  const check = await resolveOwnedVendorId(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const { amount, expenseDate, isRecurring, recurringFrequency, ...rest } = parsed.data;
  const willBeRecurring = isRecurring ?? existing.isRecurring;
  // Reflect exactly what will be written: an explicit `recurringFrequency:
  // null` must NOT fall back to the existing value here, or a request that
  // clears the frequency while leaving isRecurring true would pass
  // validation while still writing a null frequency to the DB — which then
  // makes the background job silently skip this template forever.
  const effectiveFrequency = recurringFrequency !== undefined ? recurringFrequency : existing.recurringFrequency;
  if (willBeRecurring && !effectiveFrequency) {
    res.status(400).json({ error: "recurringFrequency is required when isRecurring is true" });
    return;
  }
  const resolvedExpenseDate = expenseDate !== undefined ? new Date(expenseDate) : existing.expenseDate;

  const updateData = {
    ...rest,
    ...(amount !== undefined ? { amount: amount.toString() } : {}),
    ...(expenseDate !== undefined ? { expenseDate: resolvedExpenseDate } : {}),
    ...(isRecurring !== undefined ? { isRecurring } : {}),
    ...(recurringFrequency !== undefined ? { recurringFrequency } : {}),
    ...(willBeRecurring
      ? // Turning recurring on, or changing its frequency/date — (re)compute
        // when the next occurrence is due from the current expense date.
        (isRecurring === true || recurringFrequency !== undefined || expenseDate !== undefined) && effectiveFrequency
        ? { nextOccurrenceDate: computeNextOccurrenceDate(resolvedExpenseDate, effectiveFrequency as "weekly" | "monthly" | "yearly") }
        : {}
      : // Turning recurring off — no more occurrences should be generated.
        { nextOccurrenceDate: null }),
  };
  const [expense] = await db.update(expensesTable).set(updateData).where(eq(expensesTable.id, params.data.id)).returning();
  res.json(UpdateExpenseResponse.parse(serializeExpense(expense)));
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const params = DeleteExpenseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(expensesTable).where(eq(expensesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Expense not found" }); return; }
  const check = await resolveOwnedVendorId(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  await db.delete(expensesTable).where(eq(expensesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
