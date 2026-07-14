/**
 * /external/voice-campaigns — read-only voice-campaign views for the mobile
 * app. Mirrors the vendor-scoped GET routes in ../voice-campaigns.ts (list +
 * detail with per-call records), but scoped to req.externalUser.vendorId
 * instead of a :id path param + ownerOrAdmin check — the same pattern used
 * by external/payments.ts.
 *
 * Creating, editing, and launching campaigns stays web-only for now; the
 * mobile screen is for vendors to check on a campaign (especially the one
 * a "campaign finished" push notification points at).
 */
import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { voiceCampaignsTable, voiceCampaignCallsTable } from "@workspace/db/schema";
import { requireExternalAuth } from "../../middlewares/requireExternalAuth";

const router = Router();
router.use(requireExternalAuth);

router.get("/voice-campaigns", async (req, res) => {
  const { vendorId } = req.externalUser!;

  const campaigns = await db
    .select()
    .from(voiceCampaignsTable)
    .where(eq(voiceCampaignsTable.vendorId, vendorId))
    .orderBy(desc(voiceCampaignsTable.createdAt));

  const summaries = await Promise.all(
    campaigns.map(async (campaign) => {
      const calls = await db
        .select()
        .from(voiceCampaignCallsTable)
        .where(eq(voiceCampaignCallsTable.campaignId, campaign.id));
      const answered = calls.filter((c) => c.status === "completed").length;
      return {
        id: campaign.id,
        name: campaign.name,
        script: campaign.script,
        status: campaign.status,
        scheduledAt: campaign.scheduledAt ? campaign.scheduledAt.toISOString() : null,
        createdAt: campaign.createdAt.toISOString(),
        totalCalls: calls.length,
        answeredCalls: answered,
      };
    }),
  );

  res.json(summaries);
});

router.get("/voice-campaigns/:id", async (req, res): Promise<void> => {
  const { vendorId } = req.externalUser!;
  const campaignId = Number(req.params.id);
  if (!Number.isInteger(campaignId)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const [campaign] = await db
    .select()
    .from(voiceCampaignsTable)
    .where(and(eq(voiceCampaignsTable.id, campaignId), eq(voiceCampaignsTable.vendorId, vendorId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  const calls = await db
    .select()
    .from(voiceCampaignCallsTable)
    .where(eq(voiceCampaignCallsTable.campaignId, campaignId))
    .orderBy(desc(voiceCampaignCallsTable.initiatedAt));

  const answered = calls.filter((c) => c.status === "completed").length;
  const withDuration = calls.filter((c) => c.durationSeconds != null);
  const avgDuration =
    withDuration.reduce((s, c) => s + (c.durationSeconds ?? 0), 0) / (withDuration.length || 1);

  res.json({
    id: campaign.id,
    name: campaign.name,
    script: campaign.script,
    status: campaign.status,
    scheduledAt: campaign.scheduledAt ? campaign.scheduledAt.toISOString() : null,
    createdAt: campaign.createdAt.toISOString(),
    stats: {
      totalCalls: calls.length,
      answeredCalls: answered,
      answerRate: calls.length ? Math.round((answered / calls.length) * 100) : 0,
      avgDurationSeconds: Math.round(avgDuration),
    },
    calls: calls.map((c) => ({
      id: c.id,
      leadName: c.leadName,
      phone: c.phone,
      status: c.status,
      durationSeconds: c.durationSeconds,
      callSid: c.callSid,
      initiatedAt: c.initiatedAt.toISOString(),
    })),
  });
});

export default router;
