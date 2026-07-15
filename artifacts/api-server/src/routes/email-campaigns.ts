import { Router, type IRouter } from "express";
import { eq, desc, ne, and } from "drizzle-orm";
import { db, emailCampaignsTable } from "@workspace/db";
import { consumeQuotaTx, getVendorForUsage, quotaExceededMessage } from "../lib/usage";
import {
  ListEmailCampaignsQueryParams,
  CreateEmailCampaignBody,
  GetEmailCampaignStatsQueryParams,
  GetEmailCampaignParams,
  UpdateEmailCampaignParams,
  UpdateEmailCampaignBody,
  SendEmailCampaignParams,
  ListEmailCampaignsResponse,
  CreateEmailCampaignResponse,
  GetEmailCampaignStatsResponse,
  GetEmailCampaignResponse,
  UpdateEmailCampaignResponse,
  SendEmailCampaignResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/email-campaigns/stats", async (req, res): Promise<void> => {
  const params = GetEmailCampaignStatsQueryParams.safeParse(req.query);
  let campaigns = await db.select().from(emailCampaignsTable).orderBy(desc(emailCampaignsTable.createdAt));
  if (params.success && params.data.vendorId) {
    campaigns = campaigns.filter((c) => c.vendorId === params.data.vendorId);
  }
  const totalCampaigns = campaigns.length;
  const totalSent = campaigns.reduce((s, c) => s + c.sentCount, 0);
  const campaignsWithSent = campaigns.filter((c) => c.sentCount > 0);
  const avgOpenRate = campaignsWithSent.length > 0
    ? campaignsWithSent.reduce((s, c) => s + (c.openCount / Math.max(c.sentCount, 1)), 0) / campaignsWithSent.length
    : 0;
  const avgClickRate = campaignsWithSent.length > 0
    ? campaignsWithSent.reduce((s, c) => s + (c.clickCount / Math.max(c.sentCount, 1)), 0) / campaignsWithSent.length
    : 0;
  res.json(GetEmailCampaignStatsResponse.parse({
    totalCampaigns,
    totalSent,
    avgOpenRate,
    avgClickRate,
    recentCampaigns: campaigns.slice(0, 5).map(serializeCampaign),
  }));
});

router.get("/email-campaigns", async (req, res): Promise<void> => {
  const params = ListEmailCampaignsQueryParams.safeParse(req.query);
  let campaigns = await db.select().from(emailCampaignsTable).orderBy(desc(emailCampaignsTable.createdAt));
  if (params.success) {
    if (params.data.vendorId) campaigns = campaigns.filter((c) => c.vendorId === params.data.vendorId);
    if (params.data.status) campaigns = campaigns.filter((c) => c.status === params.data.status);
  }
  res.json(ListEmailCampaignsResponse.parse(campaigns.map(serializeCampaign)));
});

router.post("/email-campaigns", async (req, res): Promise<void> => {
  const parsed = CreateEmailCampaignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { scheduledAt, ...rest } = parsed.data;
  const [campaign] = await db.insert(emailCampaignsTable).values({
    ...rest,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
  }).returning();
  res.status(201).json(CreateEmailCampaignResponse.parse(serializeCampaign(campaign)));
});

router.get("/email-campaigns/:id", async (req, res): Promise<void> => {
  const params = GetEmailCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [campaign] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, params.data.id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(GetEmailCampaignResponse.parse(serializeCampaign(campaign)));
});

router.patch("/email-campaigns/:id", async (req, res): Promise<void> => {
  const params = UpdateEmailCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateEmailCampaignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { scheduledAt: sa, ...restU } = parsed.data;
  const updateData = { ...restU, ...(sa !== undefined ? { scheduledAt: sa ? new Date(sa) : null } : {}) };
  const [campaign] = await db.update(emailCampaignsTable).set(updateData).where(eq(emailCampaignsTable.id, params.data.id)).returning();
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(UpdateEmailCampaignResponse.parse(serializeCampaign(campaign)));
});

router.post("/email-campaigns/:id/send", async (req, res): Promise<void> => {
  const params = SendEmailCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [campaign] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, params.data.id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  // Already sent — a duplicate/retried request must not re-send or
  // re-charge quota; report the prior result as a no-op success.
  if (campaign.status === "sent") {
    res.json(SendEmailCampaignResponse.parse({
      sent: campaign.sentCount,
      failed: 0,
      message: `Campaign "${campaign.name}" was already sent to ${campaign.sentCount} recipients`,
    }));
    return;
  }

  const usageVendor = await getVendorForUsage(campaign.vendorId);
  if (!usageVendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  // Simulate sending (real implementation connects to Resend/SendGrid)
  const sentCount = campaign.recipientCount;
  let quotaExceeded: Awaited<ReturnType<typeof consumeQuotaTx>> | undefined;

  // Single transaction: atomically claim the draft->sent transition AND
  // reserve quota together — see sms-campaigns.ts for the full rationale
  // (same pattern, shared to avoid duplicate sends/charges on retry or race).
  try {
    await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(emailCampaignsTable)
        .set({ status: "sending" })
        .where(and(eq(emailCampaignsTable.id, campaign.id), ne(emailCampaignsTable.status, "sent")))
        .returning({ id: emailCampaignsTable.id });
      if (!claimed) throw new AlreadySentError();

      const quotaCheck = await consumeQuotaTx(tx, usageVendor, "email", sentCount);
      if (!quotaCheck.allowed) {
        quotaExceeded = quotaCheck;
        throw new QuotaExceededError();
      }

      await tx.update(emailCampaignsTable).set({
        status: "sent",
        sentCount,
        sentAt: new Date(),
        openCount: Math.floor(sentCount * 0.22),
        clickCount: Math.floor(sentCount * 0.05),
      }).where(eq(emailCampaignsTable.id, campaign.id));
    });
  } catch (err) {
    if (err instanceof AlreadySentError) {
      const [latest] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, campaign.id));
      res.json(SendEmailCampaignResponse.parse({
        sent: latest?.sentCount ?? sentCount,
        failed: 0,
        message: `Campaign "${campaign.name}" was already sent to ${latest?.sentCount ?? sentCount} recipients`,
      }));
      return;
    }
    if (err instanceof QuotaExceededError && quotaExceeded) {
      res.status(402).json({ error: quotaExceededMessage(usageVendor, quotaExceeded), usage: quotaExceeded });
      return;
    }
    throw err;
  }

  res.json(SendEmailCampaignResponse.parse({
    sent: sentCount,
    failed: 0,
    message: `Campaign "${campaign.name}" sent to ${sentCount} recipients`,
  }));
});

class AlreadySentError extends Error {}
class QuotaExceededError extends Error {}

function serializeCampaign(c: typeof emailCampaignsTable.$inferSelect) {
  return {
    ...c,
    scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
    sentAt: c.sentAt ? c.sentAt.toISOString() : null,
  };
}

export default router;
