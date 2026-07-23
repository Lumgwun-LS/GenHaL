/**
 * External-auth (mobile JWT) wrapper for admin void-error endpoints.
 * These mirror the Clerk-auth routes in admin-void-errors.ts but are
 * accessible from the mobile app using the VendorHub external session token.
 *
 * Only vendors whose clerkUserId is listed in ADMIN_USER_IDS may call these.
 *
 * GET  /external/admin/void-errors              — unacknowledged void-error payments
 * POST /external/admin/void-errors/:id/acknowledge — dismiss once reviewed
 */

import { Router } from "express";
import { db, paymentsTable, vendorsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireExternalAuth } from "../../middlewares/requireExternalAuth";

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

/**
 * GET /external/admin/void-errors
 * Returns cancelled payments where the Stripe session void failed.
 * Query params:
 *   showAcknowledged=true — include already-acknowledged payments
 */
router.get("/admin/void-errors", async (req, res): Promise<void> => {
  const { vendorId } = req.externalUser!;

  // Resolve the vendor row to check their Clerk user ID.
  const [vendor] = await db
    .select({ clerkUserId: vendorsTable.clerkUserId })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendorId))
    .limit(1);

  if (!isAdminVendor(vendor?.clerkUserId)) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }

  const showAcknowledged = req.query.showAcknowledged === "true";

  // Include rows that still have an active voidError AND rows that were
  // auto-recovered by the scheduler (voidRecoveredAt set, voidError cleared).
  const whereClause = showAcknowledged
    ? sql`(
        ${paymentsTable.metadata} ->> 'voidError' IS NOT NULL
        OR ${paymentsTable.metadata} ->> 'voidRecoveredAt' IS NOT NULL
      )`
    : sql`(
        ${paymentsTable.metadata} ->> 'voidError' IS NOT NULL
        OR ${paymentsTable.metadata} ->> 'voidRecoveredAt' IS NOT NULL
      )
      AND (${paymentsTable.metadata} ->> 'voidErrorAcknowledgedAt') IS NULL`;

  const rows = await db
    .select({
      id: paymentsTable.id,
      vendorId: paymentsTable.vendorId,
      vendorName: vendorsTable.name,
      orderId: paymentsTable.orderId,
      provider: paymentsTable.provider,
      providerReference: paymentsTable.providerReference,
      amount: paymentsTable.amount,
      currency: paymentsTable.currency,
      status: paymentsTable.status,
      metadata: paymentsTable.metadata,
      updatedAt: paymentsTable.updatedAt,
    })
    .from(paymentsTable)
    .leftJoin(vendorsTable, eq(paymentsTable.vendorId, vendorsTable.id))
    .where(whereClause)
    .orderBy(desc(paymentsTable.updatedAt))
    .limit(200);

  const result = rows.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      vendorId: r.vendorId,
      vendorName: r.vendorName,
      orderId: r.orderId,
      provider: r.provider,
      providerReference: r.providerReference,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      voidError: typeof meta.voidError === "string" ? meta.voidError : null,
      voidErrorAt: typeof meta.voidErrorAt === "string" ? meta.voidErrorAt : null,
      voidErrorAlertedAt: typeof meta.voidErrorAlertedAt === "string" ? meta.voidErrorAlertedAt : null,
      voidErrorRetryAttemptedAt: typeof meta.voidErrorRetryAttemptedAt === "string" ? meta.voidErrorRetryAttemptedAt : null,
      voidErrorAcknowledgedAt: typeof meta.voidErrorAcknowledgedAt === "string" ? meta.voidErrorAcknowledgedAt : null,
      voidErrorAcknowledgedBy: typeof meta.voidErrorAcknowledgedBy === "string" ? meta.voidErrorAcknowledgedBy : null,
      voidRecoveredAt: typeof meta.voidRecoveredAt === "string" ? meta.voidRecoveredAt : null,
      updatedAt: r.updatedAt?.toISOString() ?? null,
    };
  });

  res.json(result);
});

/**
 * POST /external/admin/void-errors/:id/acknowledge
 * Marks a void-error payment as reviewed so it leaves the active list.
 */
router.post("/admin/void-errors/:id/acknowledge", async (req, res): Promise<void> => {
  const { vendorId } = req.externalUser!;

  const [vendor] = await db
    .select({ clerkUserId: vendorsTable.clerkUserId })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendorId))
    .limit(1);

  if (!isAdminVendor(vendor?.clerkUserId)) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }

  const paymentId = Number(req.params.id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    res.status(400).json({ error: "Invalid payment id." });
    return;
  }

  const [existing] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.id, paymentId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Payment not found." });
    return;
  }

  const meta = (existing.metadata ?? {}) as Record<string, unknown>;

  if (!meta.voidError && !meta.voidRecoveredAt) {
    res.status(400).json({ error: "This payment has no recorded void error." });
    return;
  }

  if (meta.voidErrorAcknowledgedAt) {
    res.status(400).json({ error: "This void error has already been acknowledged." });
    return;
  }

  await db
    .update(paymentsTable)
    .set({
      metadata: {
        ...meta,
        voidErrorAcknowledgedAt: new Date().toISOString(),
        voidErrorAcknowledgedBy: `vendor:${vendorId}`,
      },
      updatedAt: new Date(),
    })
    .where(eq(paymentsTable.id, paymentId));

  res.json({ ok: true });
});

export default router;
