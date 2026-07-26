import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc, asc, gt, isNull } from "drizzle-orm";
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

  // Pagination is opt-in — only apply a limit when the caller explicitly requests one.
  // This preserves backward compatibility: clients that don't pass ?limit= still receive all results.
  const MAX_LIMIT = 500;
  const hasLimit = req.query.limit !== undefined;
  const rawLimit = Number(req.query.limit ?? MAX_LIMIT);
  const rawOffset = Number(req.query.offset ?? 0);
  const limit = hasLimit && Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : undefined;
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const baseQuery = db.select().from(expensesTable)
    .where(and(...conditions))
    .orderBy(desc(expensesTable.expenseDate));
  const expenses = await (limit !== undefined ? baseQuery.limit(limit).offset(offset) : baseQuery.offset(offset));
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
  const HEADERS = ["ID", "Category", "Description", "Amount", "Currency", "Expense Date"];
  function csvCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    // Prevent CSV formula injection: prefix formula-starting chars with a single quote
    // so spreadsheet software treats the cell as literal text, not a formula.
    const safe = /^[=+\-@|\t]/.test(s) ? `'${s}` : s;
    if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) return `"${safe.replace(/"/g, '""')}"`;
    return safe;
  }
  const filename = `expenses-export-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.write(HEADERS.join(",") + "\r\n");

  // Stream expenses in fixed-size batches ordered by a stable, indexed key
  // (id) so memory usage stays constant regardless of history size — mirrors
  // the admin vendor export's batching pattern.
  const BATCH_SIZE = 500;
  let lastId = 0;
  while (true) {
    const batch = await db
      .select()
      .from(expensesTable)
      .where(and(...conditions, gt(expensesTable.id, lastId)))
      .orderBy(asc(expensesTable.id))
      .limit(BATCH_SIZE);
    if (batch.length === 0) break;

    let chunk = "";
    for (const e of batch) {
      chunk += [e.id, e.category, e.description, e.amount, e.currency, e.expenseDate.toISOString()].map(csvCell).join(",") + "\r\n";
    }
    res.write(chunk);

    lastId = batch[batch.length - 1]!.id;
    if (batch.length < BATCH_SIZE) break;
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

  const { amount, expenseDate, isRecurring, recurringFrequency, recurringPaused, ...rest } = parsed.data;
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
  const isResuming = recurringPaused === false && existing.recurringPaused === true;
  const resolvedExpenseDate = expenseDate !== undefined ? new Date(expenseDate) : existing.expenseDate;

  // When resuming without a date/frequency change, keep nextOccurrenceDate at the
  // last-scheduled value (the first missed period) so the scheduler's catch-up loop
  // picks up every period that elapsed while the template was paused.
  // Only when frequency or base-date also changes do we recompute — and we use the
  // existing nextOccurrenceDate as the anchor (not "now") so catch-up still starts
  // from the correct point rather than from the moment of resumption.
  const isPureResume = isResuming && recurringFrequency === undefined && expenseDate === undefined;

  const updateData = {
    ...rest,
    ...(amount !== undefined ? { amount: amount.toString() } : {}),
    ...(expenseDate !== undefined ? { expenseDate: resolvedExpenseDate } : {}),
    ...(isRecurring !== undefined ? { isRecurring } : {}),
    ...(recurringFrequency !== undefined ? { recurringFrequency } : {}),
    ...(recurringPaused !== undefined ? { recurringPaused } : {}),
    ...(willBeRecurring
      ? // Turning recurring on, or changing its frequency/date, or resuming from pause:
        isPureResume
        ? {} // Keep nextOccurrenceDate unchanged — scheduler catches up from there
        : (isRecurring === true || recurringFrequency !== undefined || expenseDate !== undefined || isResuming) && effectiveFrequency
          ? {
              // Recompute from existing nextOccurrenceDate (or resolvedExpenseDate for
              // new templates) — not from "now" — so we don't silently skip missed periods.
              nextOccurrenceDate: computeNextOccurrenceDate(
                isResuming && existing.nextOccurrenceDate ? existing.nextOccurrenceDate : resolvedExpenseDate,
                effectiveFrequency as "weekly" | "monthly" | "yearly",
              ),
            }
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

  // If this is a recurring template (isRecurring=true, no parent), detach any
  // auto-generated occurrence rows so they don't carry a dangling reference.
  if (existing.isRecurring && !existing.recurringParentId) {
    await db
      .update(expensesTable)
      .set({ recurringParentId: null })
      .where(eq(expensesTable.recurringParentId, params.data.id));
  }

  await db.delete(expensesTable).where(eq(expensesTable.id, params.data.id));
  res.sendStatus(204);
});

// ── CSV Import ───────────────────────────────────────────────────────────────
import multer from "multer";
const _csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function parseCSVBuffer(buffer: Buffer): string[][] {
  const text = buffer.toString("utf8");
  const rows: string[][] = [];
  let row: string[] = [], current = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) { row.push(current.trim()); current = ""; }
    else if ((ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) && !inQuotes) {
      if (ch === '\r') i++;
      row.push(current.trim());
      if (row.some(v => v !== '')) rows.push(row);
      row = []; current = "";
    } else current += ch;
  }
  if (current !== '' || row.length > 0) { row.push(current.trim()); if (row.some(v => v !== '')) rows.push(row); }
  return rows;
}

const VALID_CATEGORIES = ["Inventory", "Marketing", "Utilities", "Rent", "Payroll", "Shipping", "Software", "Fees", "Travel", "Other"];

router.post("/expenses/import", _csvUpload.single("file"), async (req: any, res: any): Promise<void> => {
  const vendorId = Number(req.query.vendorId ?? req.body.vendorId);
  if (isNaN(vendorId)) { res.status(400).json({ error: "vendorId is required" }); return; }
  const check = await resolveOwnedVendorId(req, vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  if (!req.file) { res.status(400).json({ error: "No CSV file uploaded" }); return; }

  const rows = parseCSVBuffer(req.file.buffer);
  if (rows.length < 2) { res.status(400).json({ error: "CSV must have a header row and at least one data row" }); return; }
  const header = rows[0]!.map(h => h.toLowerCase().replace(/\s+/g, "_"));
  const col = (n: string) => header.indexOf(n);

  let imported = 0;
  const errors: { row: number; error: string }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const amount = parseFloat(r[col("amount")] ?? "");
    if (isNaN(amount)) { errors.push({ row: i + 1, error: "Amount is required" }); continue; }
    const rawCat = r[col("category")] ?? "";
    const category = VALID_CATEGORIES.find(c => c.toLowerCase() === rawCat.toLowerCase()) ?? "Other";
    try {
      const rawDate = r[col("date")] || r[col("expense_date")] || "";
      await db.insert(expensesTable).values({
        vendorId,
        category,
        description: r[col("description")] || null,
        amount: amount.toString(),
        expenseDate: rawDate ? new Date(rawDate) : new Date(),
        isRecurring: false,
      });
      imported++;
    } catch (e: any) { errors.push({ row: i + 1, error: e.message ?? "Insert failed" }); }
  }
  res.json({ imported, skipped: 0, errors: errors.length, errorDetails: errors.slice(0, 20) });
});

export default router;
