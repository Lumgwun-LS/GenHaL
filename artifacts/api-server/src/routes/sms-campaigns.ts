import { Router, type IRouter } from "express";
import { eq, desc, ne, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, smsCampaignsTable, vendorsTable } from "@workspace/db";
import { consumeQuotaTx, getVendorForUsage, quotaExceededMessage } from "../lib/usage";
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

/** Resolve the authenticated vendor; admins may act on any vendorId. */
async function resolveAuthedVendor(req: import("express").Request): Promise<{ vendorId: number | null; isAdmin: boolean }> {
  const { userId } = getAuth(req);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}

router.get("/sms-campaigns", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = ListSmsCampaignsQueryParams.safeParse(req.query);
  const requestedVendorId = params.success && params.data.vendorId ? params.data.vendorId : null;
  // Non-admins always see only their own vendor's campaigns.
  const effectiveVendorId = authed.isAdmin ? (requestedVendorId ?? authed.vendorId) : authed.vendorId;

  let query = db.select().from(smsCampaignsTable).orderBy(desc(smsCampaignsTable.createdAt)).$dynamic();
  if (effectiveVendorId !== null) {
    query = query.where(eq(smsCampaignsTable.vendorId, effectiveVendorId));
  }
  let campaigns = await query;

  // Status filter (safe to apply in-memory — already vendor-scoped above).
  if (params.success && params.data.status) {
    campaigns = campaigns.filter((c) => c.status === params.data.status);
  }
  res.json(ListSmsCampaignsResponse.parse(campaigns.map(serializeCampaign)));
});

router.post("/sms-campaigns", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateSmsCampaignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Non-admins can only create campaigns for their own vendor.
  const vendorId = authed.isAdmin ? (parsed.data.vendorId ?? authed.vendorId) : authed.vendorId;
  if (!vendorId) { res.status(400).json({ error: "vendorId is required" }); return; }
  if (!authed.isAdmin && parsed.data.vendorId && parsed.data.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "You can only create SMS campaigns for your own vendor." });
    return;
  }

  const { scheduledAt, ...rest } = parsed.data;
  const insertData = { ...rest, vendorId, scheduledAt: scheduledAt ? new Date(scheduledAt) : null };
  const [campaign] = await db.insert(smsCampaignsTable).values(insertData).returning();
  res.status(201).json(CreateSmsCampaignResponse.parse(serializeCampaign(campaign)));
});

router.get("/sms-campaigns/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = GetSmsCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [campaign] = await db.select().from(smsCampaignsTable).where(eq(smsCampaignsTable.id, params.data.id));
  if (!campaign) { res.status(404).json({ error: "SMS campaign not found" }); return; }

  if (!authed.isAdmin && campaign.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "You do not have permission to view this campaign." });
    return;
  }

  res.json(GetSmsCampaignResponse.parse(serializeCampaign(campaign)));
});

router.patch("/sms-campaigns/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = UpdateSmsCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateSmsCampaignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Verify ownership before updating.
  const [existing] = await db.select({ vendorId: smsCampaignsTable.vendorId }).from(smsCampaignsTable).where(eq(smsCampaignsTable.id, params.data.id));
  if (!existing) { res.status(404).json({ error: "SMS campaign not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "You do not have permission to update this campaign." });
    return;
  }

  const { scheduledAt: sa, ...restUpdate } = parsed.data;
  const updateData = { ...restUpdate, ...(sa !== undefined ? { scheduledAt: sa ? new Date(sa) : null } : {}) };
  const [campaign] = await db.update(smsCampaignsTable).set(updateData).where(eq(smsCampaignsTable.id, params.data.id)).returning();
  if (!campaign) { res.status(404).json({ error: "SMS campaign not found" }); return; }
  res.json(UpdateSmsCampaignResponse.parse(serializeCampaign(campaign)));
});

router.post("/sms-campaigns/:id/send", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const params = SendSmsCampaignParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [campaign] = await db.select().from(smsCampaignsTable).where(eq(smsCampaignsTable.id, params.data.id));
  if (!campaign) { res.status(404).json({ error: "SMS campaign not found" }); return; }

  if (!authed.isAdmin && campaign.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "You do not have permission to send this campaign." });
    return;
  }

  // Already sent — a duplicate/retried request (e.g. a client double-submit)
  // must not re-send or re-charge quota. Report the prior result as a no-op
  // success rather than erroring, since from the caller's point of view the
  // campaign genuinely was sent.
  if (campaign.status === "sent") {
    res.json(SendSmsCampaignResponse.parse({
      sent: campaign.sentCount ?? campaign.recipientCount,
      failed: 0,
      message: `SMS campaign "${campaign.name}" was already sent to ${campaign.sentCount ?? campaign.recipientCount} recipients`,
    }));
    return;
  }

  const usageVendor = await getVendorForUsage(campaign.vendorId);
  if (!usageVendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const sentCount = campaign.recipientCount;
  let quotaExceeded: Awaited<ReturnType<typeof consumeQuotaTx>> | undefined;

  // Single transaction: atomically claim the draft->sent transition AND
  // reserve quota together. If quota is insufficient, throwing here rolls
  // back the status claim too, so the campaign stays sendable and no usage
  // is recorded. If two requests race, the DB row lock on the UPDATE
  // serializes them — the loser sees status already "sent" post-lock and
  // affects 0 rows, so it never reaches (and never double-charges) quota.
  try {
    await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(smsCampaignsTable)
        .set({ status: "sending" })
        .where(and(eq(smsCampaignsTable.id, campaign.id), ne(smsCampaignsTable.status, "sent")))
        .returning({ id: smsCampaignsTable.id });
      if (!claimed) {
        // Lost the race to a concurrent request that already sent it.
        throw new AlreadySentError();
      }

      const quotaCheck = await consumeQuotaTx(tx, usageVendor, "sms", sentCount);
      if (!quotaCheck.allowed) {
        quotaExceeded = quotaCheck;
        throw new QuotaExceededError();
      }

      await tx.update(smsCampaignsTable).set({
        status: "sent",
        sentCount,
        sentAt: new Date(),
      }).where(eq(smsCampaignsTable.id, campaign.id));
    });
  } catch (err) {
    if (err instanceof AlreadySentError) {
      const [latest] = await db.select().from(smsCampaignsTable).where(eq(smsCampaignsTable.id, campaign.id));
      res.json(SendSmsCampaignResponse.parse({
        sent: latest?.sentCount ?? sentCount,
        failed: 0,
        message: `SMS campaign "${campaign.name}" was already sent to ${latest?.sentCount ?? sentCount} recipients`,
      }));
      return;
    }
    if (err instanceof QuotaExceededError && quotaExceeded) {
      res.status(402).json({ error: quotaExceededMessage(usageVendor, quotaExceeded), usage: quotaExceeded });
      return;
    }
    throw err;
  }

  res.json(SendSmsCampaignResponse.parse({
    sent: sentCount,
    failed: 0,
    message: `SMS campaign "${campaign.name}" sent to ${sentCount} recipients`,
  }));
});

class AlreadySentError extends Error {}
class QuotaExceededError extends Error {}

function serializeCampaign(c: typeof smsCampaignsTable.$inferSelect) {
  return {
    ...c,
    scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
    sentAt: c.sentAt ? c.sentAt.toISOString() : null,
  };
}

export default router;
