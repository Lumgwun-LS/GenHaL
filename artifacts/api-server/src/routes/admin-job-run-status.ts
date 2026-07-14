/**
 * Admin-only visibility across every background job that reports into
 * job_run_status, not just the two with a bespoke panel (billing sync,
 * social health). Exists so a job's very first tick failing — e.g. because
 * a migration was written but never applied (see schema-guard.ts) — is
 * visible somewhere in the admin panel even before anyone builds it a
 * dedicated page.
 *
 * GET /admin/job-run-status — every job's last run time, outcome, and
 *                              whether it's currently stuck failing
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { getAllJobRunStatuses } from "../lib/job-run-status";

/** Returns true if the calling Clerk user is listed in ADMIN_USER_IDS env var. */
function isAdmin(userId: string): boolean {
  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

const router = Router();

router.get("/admin/job-run-status", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const statuses = await getAllJobRunStatuses();
  res.json(statuses);
});

export default router;
