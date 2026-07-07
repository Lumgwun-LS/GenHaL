/**
 * Voice campaign routes — vendor-scoped outbound call campaigns.
 *
 * GET  /vendors/:id/voice-campaigns             — list campaigns
 * POST /vendors/:id/voice-campaigns             — create campaign
 * GET  /vendors/:id/voice-campaigns/:cid        — get campaign + call records
 * PATCH /vendors/:id/voice-campaigns/:cid       — update campaign (name/script/scheduledAt)
 * POST /vendors/:id/voice-campaigns/:cid/launch — launch: place calls to all leads
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  vendorsTable,
  voiceCampaignsTable,
  voiceCampaignCallsTable,
  voiceCallLogsTable,
  leadsTable,
} from "@workspace/db/schema";
import { placeCall } from "../lib/voice-caller";
import { logger } from "../lib/logger";
import { z } from "zod";

const router = Router();

const ADMIN_IDS = () =>
  (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

async function ownerOrAdmin(req: Parameters<Parameters<typeof router.get>[1]>[0], vendorId: number): Promise<boolean> {
  const { userId } = getAuth(req);
  if (!userId) return false;
  if (ADMIN_IDS().includes(userId)) return true;
  const [v] = await db.select({ clerkUserId: vendorsTable.clerkUserId }).from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  return v?.clerkUserId === userId;
}

// ─── List campaigns ───────────────────────────────────────────────────────────

router.get("/vendors/:id/voice-campaigns", async (req, res): Promise<void> => {
  const vendorId = Number(req.params.id);
  if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid vendor id" }); return; }
  if (!(await ownerOrAdmin(req, vendorId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const campaigns = await db
    .select()
    .from(voiceCampaignsTable)
    .where(eq(voiceCampaignsTable.vendorId, vendorId))
    .orderBy(desc(voiceCampaignsTable.createdAt));

  // Attach call counts
  const enriched = await Promise.all(campaigns.map(async (c) => {
    const calls = await db
      .select()
      .from(voiceCampaignCallsTable)
      .where(eq(voiceCampaignCallsTable.campaignId, c.id));
    const answered = calls.filter((x) => x.status === "completed").length;
    return { ...c, totalCalls: calls.length, answeredCalls: answered };
  }));

  res.json(enriched);
});

// ─── Create campaign ──────────────────────────────────────────────────────────

const CreateBody = z.object({
  name: z.string().min(1).max(200),
  script: z.string().min(1).max(2000),
  scheduledAt: z.string().optional(),
});

router.post("/vendors/:id/voice-campaigns", async (req, res): Promise<void> => {
  const vendorId = Number(req.params.id);
  if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid vendor id" }); return; }
  if (!(await ownerOrAdmin(req, vendorId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { name, script, scheduledAt } = parsed.data;
  const [campaign] = await db.insert(voiceCampaignsTable).values({
    vendorId,
    name,
    script,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
  }).returning();

  res.status(201).json(campaign);
});

// ─── Get campaign + calls ─────────────────────────────────────────────────────

router.get("/vendors/:id/voice-campaigns/:cid", async (req, res): Promise<void> => {
  const vendorId = Number(req.params.id);
  const campaignId = Number(req.params.cid);
  if (isNaN(vendorId) || isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await ownerOrAdmin(req, vendorId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const [campaign] = await db.select().from(voiceCampaignsTable)
    .where(and(eq(voiceCampaignsTable.id, campaignId), eq(voiceCampaignsTable.vendorId, vendorId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  const calls = await db.select().from(voiceCampaignCallsTable)
    .where(eq(voiceCampaignCallsTable.campaignId, campaignId))
    .orderBy(desc(voiceCampaignCallsTable.initiatedAt));

  const answered = calls.filter((c) => c.status === "completed").length;
  const avgDuration = calls.filter((c) => c.durationSeconds != null).reduce((s, c) => s + (c.durationSeconds ?? 0), 0) / (calls.filter((c) => c.durationSeconds != null).length || 1);

  res.json({
    ...campaign,
    stats: { totalCalls: calls.length, answeredCalls: answered, answerRate: calls.length ? Math.round((answered / calls.length) * 100) : 0, avgDurationSeconds: Math.round(avgDuration) },
    calls,
  });
});

// ─── Update campaign ──────────────────────────────────────────────────────────

router.patch("/vendors/:id/voice-campaigns/:cid", async (req, res): Promise<void> => {
  const vendorId = Number(req.params.id);
  const campaignId = Number(req.params.cid);
  if (isNaN(vendorId) || isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await ownerOrAdmin(req, vendorId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const PatchBody = z.object({ name: z.string().optional(), script: z.string().optional(), scheduledAt: z.string().nullish() });
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.script !== undefined) update.script = parsed.data.script;
  if (parsed.data.scheduledAt !== undefined) update.scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;

  const [campaign] = await db.update(voiceCampaignsTable).set(update)
    .where(and(eq(voiceCampaignsTable.id, campaignId), eq(voiceCampaignsTable.vendorId, vendorId)))
    .returning();

  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  res.json(campaign);
});

// ─── Launch campaign ──────────────────────────────────────────────────────────

router.post("/vendors/:id/voice-campaigns/:cid/launch", async (req, res): Promise<void> => {
  const vendorId = Number(req.params.id);
  const campaignId = Number(req.params.cid);
  if (isNaN(vendorId) || isNaN(campaignId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await ownerOrAdmin(req, vendorId))) { res.status(403).json({ error: "Forbidden" }); return; }

  const [campaign] = await db.select().from(voiceCampaignsTable)
    .where(and(eq(voiceCampaignsTable.id, campaignId), eq(voiceCampaignsTable.vendorId, vendorId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  // Validate leads BEFORE touching campaign status — prevents stuck 'running' on early error
  const E164_RE = /^\+[1-9]\d{1,14}$/;
  const leads = await db.select().from(leadsTable).where(eq(leadsTable.vendorId, vendorId));
  const callable = leads.filter((l) => l.phone && E164_RE.test(l.phone));
  if (callable.length === 0) {
    res.status(400).json({ error: "No leads with E.164 phone numbers found. Add phone numbers starting with + to your leads first." });
    return;
  }

  // Atomic status transition — prevents duplicate launch from concurrent requests.
  // Only succeeds if the campaign is not already running; returns nothing if it is.
  const [transitioned] = await db
    .update(voiceCampaignsTable)
    .set({ status: "running" })
    .where(and(
      eq(voiceCampaignsTable.id, campaignId),
      eq(voiceCampaignsTable.vendorId, vendorId),
      sql`${voiceCampaignsTable.status} != 'running'`,
    ))
    .returning();
  if (!transitioned) { res.status(409).json({ error: "Campaign is already running" }); return; }

  res.json({ message: `Launching campaign — placing ${callable.length} call(s) now.`, totalCalls: callable.length });

  // Place calls asynchronously after response is sent
  setImmediate(async () => {
    let completedCount = 0;
    let terminalStatus = "completed";
    try {
      for (const lead of callable) {
        const script = (transitioned.script).replace(/\{\{name\}\}/gi, lead.name ?? "there");

        const [callRow] = await db.insert(voiceCampaignCallsTable).values({
          campaignId,
          leadId: lead.id,
          leadName: lead.name ?? "Unknown",
          phone: lead.phone!,
          status: "queued",
        }).returning();

        const result = await placeCall({ to: lead.phone!, message: script, purpose: "campaign", vendorId, campaignId });

        await db.insert(voiceCallLogsTable).values({
          vendorId,
          campaignId,
          phone: lead.phone!,
          purpose: "campaign",
          status: result.status === "placed" ? "queued" : result.status,
          callSid: result.callSid ?? null,
        });

        await db.update(voiceCampaignCallsTable).set({
          status: result.status === "placed" ? "ringing" : (result.status === "skipped" ? "canceled" : "failed"),
          callSid: result.callSid ?? null,
        }).where(eq(voiceCampaignCallsTable.id, callRow.id));

        completedCount++;
        // Small delay between calls to avoid rate-limiting
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      terminalStatus = "failed";
      logger.error({ err, campaignId, vendorId, completedCount }, "[voice] Campaign loop error — marking failed");
    } finally {
      await db.update(voiceCampaignsTable).set({ status: terminalStatus })
        .where(eq(voiceCampaignsTable.id, campaignId));
      logger.info({ campaignId, vendorId, completedCount, terminalStatus }, "[voice] Campaign finished");
    }
  });
});

export default router;
