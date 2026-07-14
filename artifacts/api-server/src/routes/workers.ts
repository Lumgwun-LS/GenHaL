import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, workersTable, vendorsTable } from "@workspace/db";
import {
  ListWorkersQueryParams,
  CreateWorkerBody,
  UpdateWorkerParams,
  UpdateWorkerBody,
  DeleteWorkerParams,
  ListWorkersResponse,
  CreateWorkerResponse,
  UpdateWorkerResponse,
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

function serializeWorker(w: typeof workersTable.$inferSelect) {
  return {
    ...w,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

router.get("/workers", async (req, res): Promise<void> => {
  const params = ListWorkersQueryParams.safeParse(req.query);
  if (!params.success || !params.data.vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }
  const check = await resolveOwnedVendorId(req, params.data.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const conditions = [eq(workersTable.vendorId, params.data.vendorId)];
  if (params.data.branchId) conditions.push(eq(workersTable.branchId, params.data.branchId));
  if (params.data.status) conditions.push(eq(workersTable.status, params.data.status));

  const workers = await db.select().from(workersTable).where(and(...conditions)).orderBy(desc(workersTable.createdAt));
  res.json(ListWorkersResponse.parse(workers.map(serializeWorker)));
});

router.post("/workers", async (req, res): Promise<void> => {
  const parsed = CreateWorkerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const check = await resolveOwnedVendorId(req, parsed.data.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const [worker] = await db.insert(workersTable).values(parsed.data).returning();
  res.status(201).json(CreateWorkerResponse.parse(serializeWorker(worker)));
});

router.patch("/workers/:id", async (req, res): Promise<void> => {
  const params = UpdateWorkerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateWorkerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(workersTable).where(eq(workersTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Worker not found" }); return; }
  const check = await resolveOwnedVendorId(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const [worker] = await db.update(workersTable).set(parsed.data).where(eq(workersTable.id, params.data.id)).returning();
  res.json(UpdateWorkerResponse.parse(serializeWorker(worker)));
});

router.delete("/workers/:id", async (req, res): Promise<void> => {
  const params = DeleteWorkerParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(workersTable).where(eq(workersTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Worker not found" }); return; }
  const check = await resolveOwnedVendorId(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  await db.delete(workersTable).where(eq(workersTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
