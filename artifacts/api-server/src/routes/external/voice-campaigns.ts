/**
 * /external/voice-campaigns — voice-campaign management for the mobile app.
 * Mirrors the vendor-scoped GET routes in ../voice-campaigns.ts (list +
 * detail with per-call records), plus POST (create), PATCH (update), and
 * POST /:id/launch routes so vendors can create and launch campaigns from
 * the mobile app. All routes are scoped to req.externalUser.vendorId.
 */
import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  voiceCampaignsTable,
  voiceCampaignCallsTable,
  leadsTable,
} from "@workspace/db/schema";
import { requireExternalAuth } from "../../middlewares/requireExternalAuth";
import { runCampaignCalls } from "../voice-campaigns";
import { checkQuota, getVendorForUsage } from "../../lib/usage";
import { z } from "zod";

const router = Router();
router.use(requireExternalAuth);

router.get("/voice-campaigns", async (req, res) => {
  const { vendorId } = req.externalUser!;

  const E164_RE = /^\+[1-9]\d{1,14}$/;
  const [campaigns, allLeads] = await Promise.all([
    db
      .select()
      .from(voiceCampaignsTable)
      .where(eq(voiceCampaignsTable.vendorId, vendorId))
      .orderBy(desc(voiceCampaignsTable.createdAt)),
    db.select().from(leadsTable).where(eq(leadsTable.vendorId, vendorId)),
  ]);
  const totalLeads = allLeads.filter((l) => l.phone && E164_RE.test(l.phone)).length;

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
        totalLeads,
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

  const E164_RE = /^\+[1-9]\d{1,14}$/;
  const allLeads = await db.select().from(leadsTable).where(eq(leadsTable.vendorId, vendorId));
  const totalLeads = allLeads.filter((l) => l.phone && E164_RE.test(l.phone)).length;

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
      totalLeads,
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

// ─── Create campaign ──────────────────────────────────────────────────────────

const CreateBody = z.object({
  name: z.string().min(1).max(200),
  script: z.string().min(1).max(2000),
  scheduledAt: z.string().optional(),
});

router.post("/voice-campaigns", async (req, res): Promise<void> => {
  const { vendorId } = req.externalUser!;

  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { name, script, scheduledAt } = parsed.data;
  const [campaign] = await db.insert(voiceCampaignsTable).values({
    vendorId,
    name,
    script,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    status: scheduledAt ? "scheduled" : "draft",
  }).returning();

  res.status(201).json({
    ...campaign,
    scheduledAt: campaign.scheduledAt ? campaign.scheduledAt.toISOString() : null,
    createdAt: campaign.createdAt.toISOString(),
  });
});

// ─── Update campaign ──────────────────────────────────────────────────────────

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  script: z.string().min(1).max(2000).optional(),
  scheduledAt: z.string().nullish(),
});

router.patch("/voice-campaigns/:id", async (req, res): Promise<void> => {
  const { vendorId } = req.externalUser!;
  const campaignId = Number(req.params.id);
  if (!Number.isInteger(campaignId)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Reject completely empty bodies — no-op updates are almost always a client bug.
  if (
    parsed.data.name === undefined &&
    parsed.data.script === undefined &&
    parsed.data.scheduledAt === undefined
  ) {
    res.status(400).json({ error: "At least one field (name, script, or scheduledAt) is required." });
    return;
  }

  // Fetch the campaign first so we can return a clean 409 on ineligible status
  // (running/failed/completed) before touching the DB.
  const [existing] = await db.select().from(voiceCampaignsTable)
    .where(and(eq(voiceCampaignsTable.id, campaignId), eq(voiceCampaignsTable.vendorId, vendorId)));
  if (!existing) { res.status(404).json({ error: "Campaign not found" }); return; }

  if (existing.status !== "draft" && existing.status !== "scheduled") {
    res.status(409).json({
      error: `Campaign cannot be edited — its current status is '${existing.status}'. Only draft or scheduled campaigns can be edited.`,
    });
    return;
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.script !== undefined) update.script = parsed.data.script;
  if (parsed.data.scheduledAt !== undefined) {
    update.scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
    update.status = parsed.data.scheduledAt ? "scheduled" : "draft";
  }

  // Double-check with atomic predicate in case of race
  const [campaign] = await db.update(voiceCampaignsTable).set(update)
    .where(and(
      eq(voiceCampaignsTable.id, campaignId),
      eq(voiceCampaignsTable.vendorId, vendorId),
      sql`${voiceCampaignsTable.status} IN ('draft', 'scheduled')`,
    ))
    .returning();

  if (!campaign) { res.status(409).json({ error: "Campaign can no longer be edited" }); return; }

  res.json({
    ...campaign,
    scheduledAt: campaign.scheduledAt ? campaign.scheduledAt.toISOString() : null,
    createdAt: campaign.createdAt.toISOString(),
  });
});

// ─── Launch campaign ──────────────────────────────────────────────────────────

router.post("/voice-campaigns/:id/launch", async (req, res): Promise<void> => {
  const { vendorId } = req.externalUser!;
  const campaignId = Number(req.params.id);
  if (!Number.isInteger(campaignId)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const [campaign] = await db.select().from(voiceCampaignsTable)
    .where(and(eq(voiceCampaignsTable.id, campaignId), eq(voiceCampaignsTable.vendorId, vendorId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  const E164_RE = /^\+[1-9]\d{1,14}$/;
  const leads = await db.select().from(leadsTable).where(eq(leadsTable.vendorId, vendorId));
  const callable = leads.filter((l) => l.phone && E164_RE.test(l.phone));
  if (callable.length === 0) {
    res.status(400).json({ error: "No leads with E.164 phone numbers found. Add phone numbers starting with + to your leads first." });
    return;
  }

  const usageVendor = await getVendorForUsage(vendorId);
  if (!usageVendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  const quotaCheck = await checkQuota(usageVendor, "voiceMinutes", 0.01);
  if (!quotaCheck.allowed) {
    res.status(402).json({
      error: `You've used all ${quotaCheck.quota} voice campaign minutes included in your ${usageVendor.subscriptionTier} plan this period. Upgrade your plan to launch more voice campaigns.`,
      usage: quotaCheck,
    });
    return;
  }

  // Only draft/scheduled campaigns may be launched. Block completed, failed,
  // running, and any other terminal status from being relaunched — otherwise a
  // direct API call on a completed campaign would place all its calls again.
  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    const msg =
      campaign.status === "running"
        ? "Campaign is already running"
        : `Campaign cannot be launched — its current status is '${campaign.status}'`;
    res.status(409).json({ error: msg });
    return;
  }

  // Atomic status transition — prevents duplicate launch from concurrent requests.
  const [transitioned] = await db
    .update(voiceCampaignsTable)
    .set({ status: "running" })
    .where(and(
      eq(voiceCampaignsTable.id, campaignId),
      eq(voiceCampaignsTable.vendorId, vendorId),
      sql`${voiceCampaignsTable.status} IN ('draft', 'scheduled')`,
    ))
    .returning();
  if (!transitioned) { res.status(409).json({ error: "Campaign is already running or cannot be launched" }); return; }

  res.json({ message: `Launching campaign — placing ${callable.length} call(s) now.`, totalCalls: callable.length });

  // Place calls asynchronously after response is sent
  setImmediate(() => { runCampaignCalls(transitioned, vendorId, callable).catch(() => {}); });
});

export default router;
