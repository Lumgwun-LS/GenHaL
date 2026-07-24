import { Router, type IRouter } from "express";
import { eq, desc, ne, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, emailCampaignsTable, vendorsTable } from "@workspace/db";
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

/** Resolve the authenticated vendor; admins may act on any vendorId. */
async function resolveAuthedVendor(req: import("express").Request): Promise<{ vendorId: number | null; isAdmin: boolean }> {
  const { userId } = getAuth(req);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}

router.get("/email-campaigns/stats", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = GetEmailCampaignStatsQueryParams.safeParse(req.query);
  const requestedVendorId = params.success && params.data.vendorId ? params.data.vendorId : null;
  const effectiveVendorId = authed.isAdmin ? (requestedVendorId ?? authed.vendorId) : authed.vendorId;

  const campaigns = effectiveVendorId !== null
    ? await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.vendorId, effectiveVendorId)).orderBy(desc(emailCampaignsTable.createdAt))
    : await db.select().from(emailCampaignsTable).orderBy(desc(emailCampaignsTable.createdAt));

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
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = ListEmailCampaignsQueryParams.safeParse(req.query);
  const requestedVendorId = params.success && params.data.vendorId ? params.data.vendorId : null;
  // Non-admins always see only their own vendor's campaigns.
  const effectiveVendorId = authed.isAdmin ? (requestedVendorId ?? authed.vendorId) : authed.vendorId;

  let query = db.select().from(emailCampaignsTable).orderBy(desc(emailCampaignsTable.createdAt)).$dynamic();
  if (effectiveVendorId !== null) {
    query = query.where(eq(emailCampaignsTable.vendorId, effectiveVendorId));
  }
  let campaigns = await query;

  // Status filter (safe to apply in-memory — already vendor-scoped above).
  if (params.success && params.data.status) {
    campaigns = campaigns.filter((c) => c.status === params.data.status);
  }
  res.json(ListEmailCampaignsResponse.parse(campaigns.map(serializeCampaign)));
});

router.post("/email-campaigns", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateEmailCampaignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Non-admins can only create campaigns for their own vendor.
  const vendorId = authed.isAdmin ? (parsed.data.vendorId ?? authed.vendorId) : authed.vendorId;
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }
  if (!authed.isAdmin && parsed.data.vendorId && parsed.data.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "You can only create campaigns for your own vendor." });
    return;
  }

  const { scheduledAt, ...rest } = parsed.data;
  const [campaign] = await db.insert(emailCampaignsTable).values({
    ...rest,
    vendorId,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
  }).returning();
  res.status(201).json(CreateEmailCampaignResponse.parse(serializeCampaign(campaign)));
});

router.get("/email-campaigns/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = GetEmailCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [campaign] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, params.data.id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  if (!authed.isAdmin && campaign.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "You do not have permission to view this campaign." });
    return;
  }

  res.json(GetEmailCampaignResponse.parse(serializeCampaign(campaign)));
});

router.patch("/email-campaigns/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = UpdateEmailCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateEmailCampaignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Verify ownership before updating.
  const [existing] = await db.select({ vendorId: emailCampaignsTable.vendorId }).from(emailCampaignsTable).where(eq(emailCampaignsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "You do not have permission to update this campaign." });
    return;
  }

  const { scheduledAt: sa, ...restU } = parsed.data;
  const updateData = { ...restU, ...(sa !== undefined ? { scheduledAt: sa ? new Date(sa) : null } : {}) };
  const [campaign] = await db.update(emailCampaignsTable).set(updateData).where(eq(emailCampaignsTable.id, params.data.id)).returning();
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(UpdateEmailCampaignResponse.parse(serializeCampaign(campaign)));
});

router.post("/email-campaigns/:id/send", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = SendEmailCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [campaign] = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.id, params.data.id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  if (!authed.isAdmin && campaign.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "You do not have permission to send this campaign." });
    return;
  }

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
