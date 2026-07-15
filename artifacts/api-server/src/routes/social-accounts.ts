import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, socialAccountsTable, vendorsTable } from "@workspace/db";
import {
  ListSocialAccountsQueryParams,
  CreateSocialAccountBody,
  GetSocialAccountParams,
  DeleteSocialAccountParams,
  ListSocialAccountsResponse,
  CreateSocialAccountResponse,
  GetSocialAccountResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

/** Response schemas expect ISO date strings; Drizzle returns Date objects. Mirrors posts.ts serializePost. */
function serializeAccount(account: typeof socialAccountsTable.$inferSelect) {
  return {
    ...account,
    tokenExpiresAt: account.tokenExpiresAt ? account.tokenExpiresAt.toISOString() : null,
    createdAt: account.createdAt.toISOString(),
  };
}

/**
 * Resolves the calling Clerk user to their own vendor row (or confirms admin status).
 * Mirrors the ownership pattern used in posts.ts/vendors.ts.
 */
async function resolveAuthedVendor(req: import("express").Request): Promise<{ vendorId: number | null; isAdmin: boolean }> {
  const { userId } = getAuth(req);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}

router.get("/social-accounts", async (req, res): Promise<void> => {
  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = ListSocialAccountsQueryParams.safeParse(req.query);
  if (!isAdmin && params.success && params.data.vendorId && params.data.vendorId !== authedVendorId) {
    res.status(403).json({ error: "You can only view your own vendor's connected accounts." });
    return;
  }

  let accounts = await db.select().from(socialAccountsTable);
  if (!isAdmin) accounts = accounts.filter((a) => a.vendorId === authedVendorId);
  if (params.success && params.data.vendorId) {
    accounts = accounts.filter((a) => a.vendorId === params.data.vendorId);
  }
  res.json(ListSocialAccountsResponse.parse(accounts.map(serializeAccount)));
});

router.post("/social-accounts", async (req, res): Promise<void> => {
  const parsed = CreateSocialAccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!authedVendorId && !isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin && authedVendorId !== parsed.data.vendorId) {
    res.status(403).json({ error: "You can only connect accounts for your own vendor." });
    return;
  }

  const [account] = await db.insert(socialAccountsTable).values(parsed.data).returning();
  res.status(201).json(CreateSocialAccountResponse.parse(serializeAccount(account)));
});

router.get("/social-accounts/:id", async (req, res): Promise<void> => {
  const params = GetSocialAccountParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [account] = await db.select().from(socialAccountsTable).where(eq(socialAccountsTable.id, params.data.id));
  if (!account) { res.status(404).json({ error: "Social account not found" }); return; }

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!isAdmin && authedVendorId !== account.vendorId) { res.status(403).json({ error: "You do not have permission to view this account." }); return; }

  res.json(GetSocialAccountResponse.parse(serializeAccount(account)));
});

router.delete("/social-accounts/:id", async (req, res): Promise<void> => {
  const params = DeleteSocialAccountParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [existing] = await db.select({ vendorId: socialAccountsTable.vendorId }).from(socialAccountsTable).where(eq(socialAccountsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Social account not found" }); return; }

  const { vendorId: authedVendorId, isAdmin } = await resolveAuthedVendor(req);
  if (!isAdmin && authedVendorId !== existing.vendorId) { res.status(403).json({ error: "You do not have permission to disconnect this account." }); return; }

  await db.delete(socialAccountsTable).where(eq(socialAccountsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
