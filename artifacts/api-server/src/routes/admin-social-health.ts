/**
 * Admin-only visibility into the periodic social-account (Facebook/Instagram
 * OAuth token) health background job. Mirrors admin-billing-sync.ts.
 *
 * GET  /admin/social-account-health-status — last run time, what it found,
 *                                             and whether it's currently stuck failing
 * POST /admin/social-account-health-status/run — trigger a tick on demand
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
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

export default router;
