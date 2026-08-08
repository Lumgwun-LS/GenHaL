/**
 * TEMPORARY internal endpoint — grant a feature trial without Clerk auth.
 *
 * Protected by SESSION_SECRET (X-Internal-Secret header).
 * Remove this file and its registration in routes/index.ts once used.
 *
 *   POST /internal/grant-trial
 *   Headers: X-Internal-Secret: <SESSION_SECRET>
 *   Body: { vendorId: number, tier: "starter"|"pro"|"enterprise", days: number, note?: string }
 */

import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, vendorsTable, vendorNotificationsTable } from "@workspace/db";
import { sendEmail } from "../lib/mailer";
import { wrapVendorEmail, escapeHtml } from "../lib/email-branding";
import { logger } from "../lib/logger";

const router = Router();

const VALID_TIERS = ["starter", "pro", "enterprise"] as const;

function checkSecret(req: any, res: any): boolean {
  const expected = process.env.SESSION_SECRET ?? "";
  const received = (req.headers["x-internal-secret"] as string | undefined) ?? "";
  if (!expected || received !== expected) {
    res.status(401).json({ error: "Invalid secret" });
    return false;
  }
  return true;
}

router.post("/internal/grant-trial", async (req: any, res: any): Promise<void> => {
  if (!checkSecret(req, res)) return;

  const { vendorId, tier, days, note } = req.body as {
    vendorId?: number;
    tier?: string;
    days?: number;
    note?: string;
  };

  if (!vendorId || isNaN(Number(vendorId))) {
    res.status(400).json({ error: "vendorId required" });
    return;
  }
  if (!tier || !VALID_TIERS.includes(tier as any)) {
    res.status(400).json({ error: `tier must be one of: ${VALID_TIERS.join(", ")}` });
    return;
  }
  const daysNum = Number(days ?? 30);
  if (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > 365) {
    res.status(400).json({ error: "days must be 1–365" });
    return;
  }

  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.id, Number(vendorId)))
    .limit(1);

  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + daysNum * 24 * 60 * 60 * 1000);
  const grantedBy = "internal-endpoint";
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  await db
    .update(vendorsTable)
    .set({
      featureTrialTier: tier,
      featureTrialExpiresAt: expiresAt,
      featureTrialGrantedBy: grantedBy,
      featureTrialGrantedAt: now,
      featureTrialNote: note ?? "Granted via internal endpoint",
      updatedAt: now,
    })
    .where(eq(vendorsTable.id, Number(vendorId)));

  // In-app notification
  await db
    .insert(vendorNotificationsTable)
    .values({
      vendorId: Number(vendorId),
      type: "feature_trial_granted",
      message: `🎉 You've been granted a ${daysNum}-day free trial of the ${tierLabel} plan features. Enjoy full access to AI Content Studio, Website Builder, and more!`,
    })
    .catch(() => {});

  // Email notification
  if (vendor.email) {
    const expiryStr = expiresAt.toLocaleDateString("en-US", { dateStyle: "long" });
    const bodyHtml = `
      <h2 style="margin:0 0 12px">Your free feature trial is now active! 🎉</h2>
      <p>Hi ${escapeHtml(vendor.name)},</p>
      <p>You've been granted a <strong>${daysNum}-day free trial</strong> of the <strong>${tierLabel} plan</strong> features on your Awa Biz Suite dashboard.</p>
      <p>Your trial gives you access to:</p>
      <ul>
        <li>AI Content Studio (images, videos, captions)</li>
        <li>Website Builder</li>
        <li>Media Library &amp; Editor</li>
        <li>All ${tierLabel} plan features and quotas</li>
      </ul>
      <p>Your trial expires on <strong>${expiryStr}</strong>. Upgrade your plan before then to keep your access.</p>
    `;
    await sendEmail({
      to: vendor.email,
      subject: `Your ${daysNum}-day ${tierLabel} trial is now active on Awa Biz Suite`,
      html: wrapVendorEmail({ bodyHtml }),
    }).catch(() => {});
  }

  logger.info({ vendorId, tier, daysNum, expiresAt }, "Feature trial granted via internal endpoint");

  res.json({
    ok: true,
    vendorId: Number(vendorId),
    vendorName: vendor.name,
    vendorEmail: vendor.email,
    tier,
    daysNum,
    expiresAt: expiresAt.toISOString(),
    grantedBy,
    note: note ?? null,
  });
});

export default router;
