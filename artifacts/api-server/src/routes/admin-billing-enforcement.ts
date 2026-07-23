/**
 * Admin — Billing Enforcement
 *
 * GET  /admin/billing-enforcement/overview
 *   Returns billing-blocked vendors, banned identifiers, and recent threshold charges.
 *
 * POST /admin/billing-enforcement/vendors/:id/unblock
 *   Clears billingBlocked on a vendor (e.g. after payment is resolved offline).
 *
 * DELETE /admin/billing-enforcement/banned/:id
 *   Removes an entry from the banned_identifiers table.
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  db, vendorsTable, bannedIdentifiersTable, vendorOverageChargesTable, vendorNotificationsTable,
} from "@workspace/db";
import { desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean).includes(userId);
}

const router = Router();

// ── GET /admin/billing-enforcement/overview ──────────────────────────────────
router.get("/admin/billing-enforcement/overview", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId)          { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  // Blocked vendors — join with unsettled overage total
  const blocked = await db
    .select({
      id:               vendorsTable.id,
      name:             vendorsTable.name,
      email:            vendorsTable.email,
      phone:            vendorsTable.phone,
      subscriptionTier: vendorsTable.subscriptionTier,
      updatedAt:        vendorsTable.updatedAt,
      unsettledUsd:     sql<number>`coalesce((
        select sum(oc.total_usd) from vendor_overage_charges oc
        where oc.vendor_id = ${vendorsTable.id} and oc.settled_at is null
      ), 0)::float`,
    })
    .from(vendorsTable)
    .where(eq(vendorsTable.billingBlocked, true))
    .orderBy(desc(vendorsTable.updatedAt));

  // Banned identifiers
  const banned = await db
    .select()
    .from(bannedIdentifiersTable)
    .orderBy(desc(bannedIdentifiersTable.bannedAt));

  // Recent settled threshold charges (most recent 50)
  const thresholdCharges = await db
    .select({
      id:         vendorOverageChargesTable.id,
      vendorId:   vendorOverageChargesTable.vendorId,
      vendorName: vendorsTable.name,
      totalUsd:   vendorOverageChargesTable.totalUsd,
      settledAt:  vendorOverageChargesTable.settledAt,
      periodStart: vendorOverageChargesTable.periodStart,
      periodEnd:   vendorOverageChargesTable.periodEnd,
    })
    .from(vendorOverageChargesTable)
    .leftJoin(vendorsTable, eq(vendorOverageChargesTable.vendorId, vendorsTable.id))
    .where(isNotNull(vendorOverageChargesTable.settledAt))
    .orderBy(desc(vendorOverageChargesTable.settledAt))
    .limit(50);

  // Summary counts
  const [unsettledRow] = await db
    .select({
      count:    sql<number>`count(*)::int`,
      totalUsd: sql<number>`coalesce(sum(${vendorOverageChargesTable.totalUsd}), 0)::float`,
    })
    .from(vendorOverageChargesTable)
    .where(isNull(vendorOverageChargesTable.settledAt));

  res.json({
    blockedVendors:   blocked.map((v) => ({ ...v, updatedAt: v.updatedAt?.toISOString() ?? null })),
    bannedIdentifiers: banned.map((b) => ({ ...b, bannedAt: b.bannedAt.toISOString() })),
    thresholdCharges: thresholdCharges.map((c) => ({
      ...c,
      settledAt:   c.settledAt?.toISOString() ?? null,
      periodStart: c.periodStart?.toISOString() ?? null,
      periodEnd:   c.periodEnd?.toISOString() ?? null,
    })),
    summary: {
      blockedCount:      blocked.length,
      bannedCount:       banned.length,
      unsettledChargesCount: unsettledRow?.count ?? 0,
      unsettledTotalUsd: +(unsettledRow?.totalUsd ?? 0).toFixed(2),
    },
  });
});

// ── POST /admin/billing-enforcement/vendors/:id/unblock ──────────────────────
router.post("/admin/billing-enforcement/vendors/:id/unblock", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId)          { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const vendorId = parseInt(req.params.id!, 10);
  if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid vendor ID." }); return; }

  const [vendor] = await db
    .select({ id: vendorsTable.id, name: vendorsTable.name })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendorId));

  if (!vendor) { res.status(404).json({ error: "Vendor not found." }); return; }

  await db.update(vendorsTable)
    .set({ billingBlocked: false, updatedAt: new Date() })
    .where(eq(vendorsTable.id, vendorId));

  // Notify the vendor that access is restored
  await db.insert(vendorNotificationsTable).values({
    vendorId,
    type: "subscription",
    message: "Your account billing block has been lifted by an administrator. Full resource access has been restored.",
  });

  res.json({ ok: true, vendorId, name: vendor.name });
});

// ── DELETE /admin/billing-enforcement/banned/:id ─────────────────────────────
router.delete("/admin/billing-enforcement/banned/:id", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId)          { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const id = parseInt(req.params.id!, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID." }); return; }

  const [deleted] = await db
    .delete(bannedIdentifiersTable)
    .where(eq(bannedIdentifiersTable.id, id))
    .returning({ id: bannedIdentifiersTable.id });

  if (!deleted) { res.status(404).json({ error: "Entry not found." }); return; }

  res.json({ ok: true, id });
});

export default router;
