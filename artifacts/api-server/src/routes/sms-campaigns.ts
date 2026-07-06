import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, smsCampaignsTable } from "@workspace/db";
import {
  ListSmsCampaignsQueryParams,
  CreateSmsCampaignBody,
  GetSmsCampaignParams,
  UpdateSmsCampaignParams,
  UpdateSmsCampaignBody,
  SendSmsCampaignParams,
  ListSmsCampaignsResponse,
  CreateSmsCampaignResponse,
  GetSmsCampaignResponse,
  UpdateSmsCampaignResponse,
  SendSmsCampaignResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/sms-campaigns", async (req, res): Promise<void> => {
  const params = ListSmsCampaignsQueryParams.safeParse(req.query);
  let campaigns = await db.select().from(smsCampaignsTable).orderBy(desc(smsCampaignsTable.createdAt));
  if (params.success) {
    if (params.data.vendorId) campaigns = campaigns.filter((c) => c.vendorId === params.data.vendorId);
    if (params.data.status) campaigns = campaigns.filter((c) => c.status === params.data.status);
  }
  res.json(ListSmsCampaignsResponse.parse(campaigns.map(serializeCampaign)));
});

router.post("/sms-campaigns", async (req, res): Promise<void> => {
  const parsed = CreateSmsCampaignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { scheduledAt, ...rest } = parsed.data;
  const insertData = { ...rest, scheduledAt: scheduledAt ? new Date(scheduledAt) : null };
  const [campaign] = await db.insert(smsCampaignsTable).values(insertData).returning();
  res.status(201).json(CreateSmsCampaignResponse.parse(serializeCampaign(campaign)));
});

router.get("/sms-campaigns/:id", async (req, res): Promise<void> => {
  const params = GetSmsCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [campaign] = await db.select().from(smsCampaignsTable).where(eq(smsCampaignsTable.id, params.data.id));
  if (!campaign) { res.status(404).json({ error: "SMS campaign not found" }); return; }
  res.json(GetSmsCampaignResponse.parse(serializeCampaign(campaign)));
});

router.patch("/sms-campaigns/:id", async (req, res): Promise<void> => {
  const params = UpdateSmsCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateSmsCampaignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { scheduledAt: sa, ...restUpdate } = parsed.data;
  const updateData = { ...restUpdate, ...(sa !== undefined ? { scheduledAt: sa ? new Date(sa) : null } : {}) };
  const [campaign] = await db.update(smsCampaignsTable).set(updateData).where(eq(smsCampaignsTable.id, params.data.id)).returning();
  if (!campaign) { res.status(404).json({ error: "SMS campaign not found" }); return; }
  res.json(UpdateSmsCampaignResponse.parse(serializeCampaign(campaign)));
});

router.post("/sms-campaigns/:id/send", async (req, res): Promise<void> => {
  const params = SendSmsCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [campaign] = await db.select().from(smsCampaignsTable).where(eq(smsCampaignsTable.id, params.data.id));
  if (!campaign) { res.status(404).json({ error: "SMS campaign not found" }); return; }

  const sentCount = campaign.recipientCount;
  await db.update(smsCampaignsTable).set({
    status: "sent",
    sentCount,
    sentAt: new Date(),
  }).where(eq(smsCampaignsTable.id, campaign.id));

  res.json(SendSmsCampaignResponse.parse({
    sent: sentCount,
    failed: 0,
    message: `SMS campaign "${campaign.name}" sent to ${sentCount} recipients`,
  }));
});

function serializeCampaign(c: typeof smsCampaignsTable.$inferSelect) {
  return {
    ...c,
    scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
    sentAt: c.sentAt ? c.sentAt.toISOString() : null,
  };
}

export default router;
