/**
 * Admin-only visibility into the periodic social-account (Facebook/Instagram,
 * LinkedIn, X OAuth token) health background job. Mirrors admin-billing-sync.ts.
 *
 * GET  /admin/social-account-health-status — last run time, what it found,
 *                                             and whether it's currently stuck failing
 * POST /admin/social-account-health-status/run — trigger a tick on demand
 * GET  /admin/social-account-health/needs-reconnect — the actual list of
 *                                             accounts currently broken, with
 *                                             30-day reconnect-break counts so
 *                                             admins can spot repeat offenders
 * GET  /admin/social-account-health/frequent-breakers — currently-active accounts
 *                                             that have broken 2+ times in the last
 *                                             30 days; they may break again soon
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, socialAccountsTable, vendorsTable, socialAccountReconnectLogTable } from "@workspace/db";
import { getJobRunStatus } from "../lib/job-run-status";
import { SOCIAL_ACCOUNT_HEALTH_JOB_NAME, tick } from "../lib/social-account-health-scheduler";

/** Returns true if the calling Clerk user is listed in ADMIN_USER_IDS env var. */
function isAdmin(userId: string): boolean {
  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

const router = Router();

function requireAdmin(req: import("express").Request, res: import("express").Response): string | null {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  if (!isAdmin(userId)) {
    res.status(403).json({ error: "Admin access required." });
    return null;
  }
  return userId;
}

router.get("/admin/social-account-health-status", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const status = await getJobRunStatus(SOCIAL_ACCOUNT_HEALTH_JOB_NAME);
  res.json(status);
});

router.post("/admin/social-account-health-status/run", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    await tick();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Run failed: ${message}` });
    return;
  }
  const status = await getJobRunStatus(SOCIAL_ACCOUNT_HEALTH_JOB_NAME);
  res.json(status);
});

router.get("/admin/social-account-health/needs-reconnect", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Subquery: count reconnect-log entries per social_account_id in the last 30 days.
  const reconnectCounts = db
    .select({
      socialAccountId: socialAccountReconnectLogTable.socialAccountId,
      count: sql<number>`cast(count(*) as int)`.as("count"),
    })
    .from(socialAccountReconnectLogTable)
    .where(gte(socialAccountReconnectLogTable.occurredAt, thirtyDaysAgo))
    .groupBy(socialAccountReconnectLogTable.socialAccountId)
    .as("reconnect_counts");

  const rows = await db
    .select({
      id: socialAccountsTable.id,
      vendorId: socialAccountsTable.vendorId,
      vendorName: vendorsTable.name,
      platform: socialAccountsTable.platform,
      accountName: socialAccountsTable.accountName,
      lastHealthCheckError: socialAccountsTable.lastHealthCheckError,
      healthCheckFailingSince: socialAccountsTable.healthCheckFailingSince,
      lastHealthCheckAt: socialAccountsTable.lastHealthCheckAt,
      reconnectCount30d: sql<number>`coalesce(${reconnectCounts.count}, 0)`.as("reconnect_count_30d"),
    })
    .from(socialAccountsTable)
    .innerJoin(vendorsTable, eq(socialAccountsTable.vendorId, vendorsTable.id))
    .leftJoin(reconnectCounts, eq(socialAccountsTable.id, reconnectCounts.socialAccountId))
    .where(eq(socialAccountsTable.status, "needs_reconnect"))
    .orderBy(socialAccountsTable.healthCheckFailingSince);

  res.json(rows);
});

/**
 * GET /admin/social-account-health/frequent-breakers
 *
 * Returns currently-active social accounts that have broken (transitioned
 * active → needs_reconnect) 2 or more times in the last 30 days. Even though
 * they're connected right now, their history signals a deeper issue and an
 * admin may want to proactively reach out.
 */
router.get("/admin/social-account-health/frequent-breakers", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Subquery: count reconnect-log entries per social_account_id in the last 30 days.
  const reconnectCounts = db
    .select({
      socialAccountId: socialAccountReconnectLogTable.socialAccountId,
      count: sql<number>`cast(count(*) as int)`.as("count"),
    })
    .from(socialAccountReconnectLogTable)
    .where(gte(socialAccountReconnectLogTable.occurredAt, thirtyDaysAgo))
    .groupBy(socialAccountReconnectLogTable.socialAccountId)
    .as("reconnect_counts");

  const rows = await db
    .select({
      id: socialAccountsTable.id,
      vendorId: socialAccountsTable.vendorId,
      vendorName: vendorsTable.name,
      platform: socialAccountsTable.platform,
      accountName: socialAccountsTable.accountName,
      lastHealthCheckAt: socialAccountsTable.lastHealthCheckAt,
      reconnectCount30d: sql<number>`${reconnectCounts.count}`.as("reconnect_count_30d"),
    })
    .from(socialAccountsTable)
    .innerJoin(vendorsTable, eq(socialAccountsTable.vendorId, vendorsTable.id))
    .innerJoin(reconnectCounts, eq(socialAccountsTable.id, reconnectCounts.socialAccountId))
    .where(
      and(
        eq(socialAccountsTable.status, "active"),
        sql`${reconnectCounts.count} >= 2`,
      ),
    )
    .orderBy(sql`${reconnectCounts.count} desc`);

  res.json(rows);
});

export default router;
