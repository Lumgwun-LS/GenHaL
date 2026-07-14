import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, branchesTable, vendorsTable } from "@workspace/db";
import {
  ListBranchesQueryParams,
  CreateBranchBody,
  UpdateBranchParams,
  UpdateBranchBody,
  DeleteBranchParams,
  ListBranchesResponse,
  CreateBranchResponse,
  UpdateBranchResponse,
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

function serializeBranch(b: typeof branchesTable.$inferSelect) {
  return {
    ...b,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

router.get("/branches", async (req, res): Promise<void> => {
  const params = ListBranchesQueryParams.safeParse(req.query);
  if (!params.success || !params.data.vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }
  const check = await resolveOwnedVendorId(req, params.data.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const conditions = [eq(branchesTable.vendorId, params.data.vendorId)];
  if (params.data.status) conditions.push(eq(branchesTable.status, params.data.status));

  const branches = await db.select().from(branchesTable).where(and(...conditions)).orderBy(desc(branchesTable.createdAt));
  res.json(ListBranchesResponse.parse(branches.map(serializeBranch)));
});

router.post("/branches", async (req, res): Promise<void> => {
  const parsed = CreateBranchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const check = await resolveOwnedVendorId(req, parsed.data.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const [branch] = await db.insert(branchesTable).values(parsed.data).returning();
  res.status(201).json(CreateBranchResponse.parse(serializeBranch(branch)));
});

router.patch("/branches/:id", async (req, res): Promise<void> => {
  const params = UpdateBranchParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateBranchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [existing] = await db.select().from(branchesTable).where(eq(branchesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Branch not found" }); return; }
  const check = await resolveOwnedVendorId(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const [branch] = await db.update(branchesTable).set(parsed.data).where(eq(branchesTable.id, params.data.id)).returning();
  res.json(UpdateBranchResponse.parse(serializeBranch(branch)));
});

router.delete("/branches/:id", async (req, res): Promise<void> => {
  const params = DeleteBranchParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(branchesTable).where(eq(branchesTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Branch not found" }); return; }
  const check = await resolveOwnedVendorId(req, existing.vendorId);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  await db.delete(branchesTable).where(eq(branchesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
