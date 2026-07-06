import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, socialAccountsTable } from "@workspace/db";
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

router.get("/social-accounts", async (req, res): Promise<void> => {
  const params = ListSocialAccountsQueryParams.safeParse(req.query);
  let accounts = await db.select().from(socialAccountsTable);
  if (params.success && params.data.vendorId) {
    accounts = accounts.filter((a) => a.vendorId === params.data.vendorId);
  }
  res.json(ListSocialAccountsResponse.parse(accounts));
});

router.post("/social-accounts", async (req, res): Promise<void> => {
  const parsed = CreateSocialAccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [account] = await db.insert(socialAccountsTable).values(parsed.data).returning();
  res.status(201).json(CreateSocialAccountResponse.parse(account));
});

router.get("/social-accounts/:id", async (req, res): Promise<void> => {
  const params = GetSocialAccountParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [account] = await db.select().from(socialAccountsTable).where(eq(socialAccountsTable.id, params.data.id));
  if (!account) { res.status(404).json({ error: "Social account not found" }); return; }
  res.json(GetSocialAccountResponse.parse(account));
});

router.delete("/social-accounts/:id", async (req, res): Promise<void> => {
  const params = DeleteSocialAccountParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [account] = await db.delete(socialAccountsTable).where(eq(socialAccountsTable.id, params.data.id)).returning();
  if (!account) { res.status(404).json({ error: "Social account not found" }); return; }
  res.sendStatus(204);
});

export default router;
