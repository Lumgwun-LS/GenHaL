/**
 * Admin routes for surfacing payments where voidProviderSession failed to
 * expire the underlying Stripe checkout session after cancellation.
 *
 * GET  /admin/void-errors           — unacknowledged void-error payments
 * POST /admin/void-errors/:id/acknowledge — dismiss once reviewed
 */

import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, paymentsTable, vendorsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";

function isAdmin(userId: string): boolean {
  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

const router = Router();

/**
 * GET /admin/void-errors
 * Returns cancelled payments where voidProviderSession failed and the admin
 * has not yet acknowledged the error. These payments may still have a live,
 * payable Stripe checkout link even though they are locally cancelled.
 *
 * Query params:
 *   showAcknowledged=true — include payments already acknowledged by admins
 */
router.get("/admin/void-errors", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const showAcknowledged = req.query.showAcknowledged === "true";

  const whereClause = showAcknowledged
    ? sql`${paymentsTable.metadata} ->> 'voidError' IS NOT NULL`
    : sql`
        ${paymentsTable.metadata} ->> 'voidError' IS NOT NULL
        AND (${paymentsTable.metadata} ->> 'voidErrorAcknowledgedAt') IS NULL
      `;

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
      voidError: String(meta.voidError ?? ""),
      voidErrorAt: typeof meta.voidErrorAt === "string" ? meta.voidErrorAt : null,
      voidErrorAlertedAt: typeof meta.voidErrorAlertedAt === "string" ? meta.voidErrorAlertedAt : null,
      voidErrorRetryAttemptedAt: typeof meta.voidErrorRetryAttemptedAt === "string" ? meta.voidErrorRetryAttemptedAt : null,
      voidErrorAcknowledgedAt: typeof meta.voidErrorAcknowledgedAt === "string" ? meta.voidErrorAcknowledgedAt : null,
      voidErrorAcknowledgedBy: typeof meta.voidErrorAcknowledgedBy === "string" ? meta.voidErrorAcknowledgedBy : null,
      updatedAt: r.updatedAt?.toISOString() ?? null,
    };
  });

  res.json(result);
});

/**
 * POST /admin/void-errors/:id/acknowledge
 * Marks a void-error payment as reviewed/acknowledged so it leaves the
 * active list. The admin should have manually verified (via the Stripe
 * dashboard) that the session has expired or otherwise dealt with it.
 */
router.post("/admin/void-errors/:id/acknowledge", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

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

  if (!meta.voidError) {
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
        voidErrorAcknowledgedBy: userId,
      },
      updatedAt: new Date(),
    })
    .where(eq(paymentsTable.id, paymentId));

  res.json({ ok: true });
});

export default router;
