/**
 * External-auth (mobile JWT) wrapper for admin voice-backfill endpoints.
 * Mirrors the Clerk-auth routes in admin.ts but accessible from the mobile
 * app using the VendorHub external session token.
 *
 * Only vendors whose clerkUserId is listed in ADMIN_USER_IDS may call these.
 *
 * GET /external/admin/voice-backfill        — last run summary + recent reconciled calls
 * GET /external/admin/vendors/:id           — basic vendor info for the vendor detail screen
 * GET /external/admin/voice-campaigns/:id   — campaign detail (admin, no vendor-ownership restriction)
 */

import { Router } from "express";
import { db, vendorsTable } from "@workspace/db";
import { voiceCampaignsTable, voiceCampaignCallsTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireExternalAuth } from "../../middlewares/requireExternalAuth";
import {
  getVoiceBackfillLastRun,
  getVoiceBackfillRecentFixes,
} from "../../lib/voice-backfill";

const router = Router();

router.use(requireExternalAuth);

function isAdminVendor(clerkUserId: string | null | undefined): boolean {
  if (!clerkUserId) return false;
  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(clerkUserId);
}

async function resolveCallerClerkId(vendorId: number): Promise<string | null> {
  const [vendor] = await db
    .select({ clerkUserId: vendorsTable.clerkUserId })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendorId))
    .limit(1);
  return vendor?.clerkUserId ?? null;
}

/**
 * GET /external/admin/voice-backfill
 * Returns the last job-run metadata plus the capped list of recently
 * reconciled calls (vendor name, campaign name, status transition).
 */
router.get("/admin/voice-backfill", async (req, res): Promise<void> => {
  const { vendorId } = req.externalUser!;

  const clerkUserId = await resolveCallerClerkId(vendorId);
  if (!isAdminVendor(clerkUserId)) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }

  const [lastRun, recentFixes] = await Promise.all([
    getVoiceBackfillLastRun(),
    getVoiceBackfillRecentFixes(),
  ]);

  res.json({ ...lastRun, recentFixes: recentFixes ?? [] });
});

/**
 * GET /external/admin/vendors/:id
 * Returns basic vendor info so the mobile admin vendor-detail screen can
 * show name, tier, status, and contact details when the admin taps a vendor
 * link in the voice-backfill list.
 */
router.get("/admin/vendors/:id", async (req, res): Promise<void> => {
  const { vendorId: callerId } = req.externalUser!;

  const clerkUserId = await resolveCallerClerkId(callerId);
  if (!isAdminVendor(clerkUserId)) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }

  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    res.status(400).json({ error: "Invalid vendor id." });
    return;
  }

  const [vendor] = await db
    .select({
      id: vendorsTable.id,
      name: vendorsTable.name,
      email: vendorsTable.email,
      phone: vendorsTable.phone,
      industry: vendorsTable.industry,
      status: vendorsTable.status,
      subscriptionTier: vendorsTable.subscriptionTier,
      verificationLevel: vendorsTable.verificationLevel,
      country: vendorsTable.country,
      state: vendorsTable.state,
      city: vendorsTable.city,
      createdAt: vendorsTable.createdAt,
    })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, targetId))
    .limit(1);

  if (!vendor) {
    res.status(404).json({ error: "Vendor not found." });
    return;
  }

  res.json({
    ...vendor,
    createdAt: vendor.createdAt?.toISOString() ?? null,
  });
});

/**
 * GET /external/admin/voice-campaigns/:id
 * Returns campaign detail (name, script, status, stats, call list) for any
 * vendor's campaign. Unlike the vendor-scoped GET /voice-campaigns/:id, this
 * endpoint has no vendor ownership restriction so admins can review campaigns
 * belonging to any vendor when following a link from the backfill list.
 */
router.get("/admin/voice-campaigns/:id", async (req, res): Promise<void> => {
  const { vendorId: callerId } = req.externalUser!;

  const clerkUserId = await resolveCallerClerkId(callerId);
  if (!isAdminVendor(clerkUserId)) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }

  const campaignId = Number(req.params.id);
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    res.status(400).json({ error: "Invalid campaign id." });
    return;
  }

  const [campaign] = await db
    .select()
    .from(voiceCampaignsTable)
    .where(eq(voiceCampaignsTable.id, campaignId))
    .limit(1);

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found." });
    return;
  }

  // Fetch the owning vendor's name for context in the admin UI.
  const [owner] = await db
    .select({ id: vendorsTable.id, name: vendorsTable.name })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, campaign.vendorId))
    .limit(1);

  const calls = await db
    .select()
    .from(voiceCampaignCallsTable)
    .where(eq(voiceCampaignCallsTable.campaignId, campaignId))
    .orderBy(desc(voiceCampaignCallsTable.initiatedAt));

  const answered = calls.filter((c) => c.status === "completed").length;
  const withDuration = calls.filter((c) => c.durationSeconds != null);
  const avgDuration =
    withDuration.reduce((s, c) => s + (c.durationSeconds ?? 0), 0) /
    (withDuration.length || 1);

  res.json({
    id: campaign.id,
    name: campaign.name,
    script: campaign.script,
    status: campaign.status,
    vendorId: campaign.vendorId,
    vendorName: owner?.name ?? null,
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
