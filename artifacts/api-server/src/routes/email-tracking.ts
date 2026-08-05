/**
 * Email open-tracking pixel endpoint — public, no auth.
 * Mounted BEFORE requireAuth in routes/index.ts.
 *
 * Pixel URL format: GET /api/track/pixel/:token
 *
 * The handler:
 *  1. Returns a 1×1 transparent GIF immediately (before any async work).
 *  2. Updates the tracking event row (openCount, firstOpenedAt, lastOpenedAt).
 *  3. If it was a campaign email, increments email_campaigns.open_count.
 *  4. Updates platform_contacts.platform_email_open_count.
 */
import { Router } from "express";
import { db, emailTrackingEventsTable, emailCampaignsTable, platformContactsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import crypto from "crypto";

const router = Router();

/** 1×1 transparent GIF — smallest valid GIF */
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

// ── GET /track/pixel/:token ───────────────────────────────────────────────────
router.get("/track/pixel/:token", async (req, res): Promise<void> => {
  // Return the pixel immediately — never block on DB
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.send(TRANSPARENT_GIF);

  // Fire-and-forget tracking update
  const { token } = req.params;
  if (!token) return;

  try {
    const now = new Date();
    const [event] = await db
      .update(emailTrackingEventsTable)
      .set({
        openCount: sql`${emailTrackingEventsTable.openCount} + 1`,
        firstOpenedAt: sql`COALESCE(${emailTrackingEventsTable.firstOpenedAt}, ${now.toISOString()})`,
        lastOpenedAt: now,
      })
      .where(eq(emailTrackingEventsTable.token, token))
      .returning();

    if (!event) return;

    // Increment campaign open count only on the first open
    if (event.campaignId && event.openCount === 1) {
      await db
        .update(emailCampaignsTable)
        .set({ openCount: sql`${emailCampaignsTable.openCount} + 1` })
        .where(eq(emailCampaignsTable.id, event.campaignId))
        .catch(() => null);
    }

    // Update platform contact metrics
    if (event.platformContactId) {
      await db
        .update(platformContactsTable)
        .set({
          platformEmailOpenCount: sql`${platformContactsTable.platformEmailOpenCount} + 1`,
          platformEmailLastOpenedAt: now,
          updatedAt: now,
        })
        .where(eq(platformContactsTable.id, event.platformContactId))
        .catch(() => null);
    }
  } catch (err) {
    // Never surface tracking errors to callers
    logger.debug({ err, token }, "[email-tracking] pixel update error");
  }
});

/**
 * Helper: create a tracking event row and return its token.
 * Call this just before sending each email.
 */
export async function createTrackingEvent(opts: {
  emailType: string;
  recipientEmail: string;
  campaignId?: number;
  vendorId?: number;
  platformContactId?: number;
  leadId?: number;
}): Promise<string> {
  const token = crypto.randomBytes(20).toString("hex");
  await db.insert(emailTrackingEventsTable).values({
    token,
    emailType: opts.emailType,
    recipientEmail: opts.recipientEmail,
    campaignId: opts.campaignId ?? null,
    vendorId: opts.vendorId ?? null,
    platformContactId: opts.platformContactId ?? null,
    leadId: opts.leadId ?? null,
  });
  return token;
}

/**
 * Build the full tracking pixel URL to inject into an email.
 */
export function buildPixelUrl(token: string): string {
  const base = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN;
  if (!base) return "";
  return `https://${base}/api/track/pixel/${token}`;
}

export default router;
