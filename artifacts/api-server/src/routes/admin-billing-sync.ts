/**
 * Admin-only visibility into the periodic subscription-sync background job.
 *
 * GET  /admin/billing-sync-status — last run time, what it found, and
 *                                    whether it's currently stuck failing
 * POST /admin/billing-sync-status/run — trigger a tick on demand
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { getJobRunStatus } from "../lib/job-run-status";
import { SUBSCRIPTION_SYNC_JOB_NAME, tick } from "../lib/subscription-sync-scheduler";

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

router.get("/admin/billing-sync-status", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const status = await getJobRunStatus(SUBSCRIPTION_SYNC_JOB_NAME);
  res.json(status);
});

router.post("/admin/billing-sync-status/run", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    await tick();
  } catch (err) {
    // The job already recorded the failure in job_run_status — surface it
    // to the caller too, but the GET endpoint remains the source of truth.
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Run failed: ${message}` });
    return;
  }
  const status = await getJobRunStatus(SUBSCRIPTION_SYNC_JOB_NAME);
  res.json(status);
});

export default router;
