/**
 * Mobile App Build Scheduler
 *
 * Polls GitHub Actions every 5 minutes for in-progress builds.
 * The primary completion path is the GitHub Actions callback
 * (POST /internal/mobile-app/:id/apk). This scheduler is a safety net —
 * it detects runs that failed without calling the callback (e.g. network
 * error during the curl step) and marks them failed so the vendor can retry.
 *
 * It does NOT update records that are already published/failed — the
 * callback route is the authoritative writer for successful builds.
 */

import { eq } from "drizzle-orm";
import { db, vendorMobileAppsTable } from "@workspace/db";
import { checkGitHubRunStatus } from "./app-generator";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 5 * 60 * 1_000; // 5 minutes
// If a build has been in "building" for longer than this, mark it as timed out
const MAX_BUILD_AGE_MS = 45 * 60 * 1_000; // 45 minutes

async function tick(): Promise<void> {
  try {
    const inProgress = await db
      .select()
      .from(vendorMobileAppsTable)
      .where(eq(vendorMobileAppsTable.status, "building"));

    if (inProgress.length === 0) return;

    logger.info({ count: inProgress.length }, "[mobile-app-scheduler] Checking in-progress builds");

    for (const record of inProgress) {
      try {
        const runId = record.easBuildId ?? "";

        // Check for stale builds (no GitHub run ID yet or too old)
        const ageMs = Date.now() - new Date(record.createdAt).getTime();
        if (ageMs > MAX_BUILD_AGE_MS) {
          logger.warn({ recordId: record.id, ageMs }, "[mobile-app-scheduler] Build timed out");
          await db.update(vendorMobileAppsTable).set({
            status:       "failed",
            errorMessage: "Build timed out after 45 minutes — please try again.",
            updatedAt:    new Date(),
          }).where(eq(vendorMobileAppsTable.id, record.id));
          continue;
        }

        // No run ID yet — it's still being dispatched
        if (!runId || runId === "pending") continue;

        const result = await checkGitHubRunStatus(runId);

        if (result.status === "failed") {
          logger.info({ recordId: record.id, runId }, "[mobile-app-scheduler] Build failed (detected via polling)");
          await db.update(vendorMobileAppsTable).set({
            status:       "failed",
            errorMessage: result.errorMessage ?? "Build failed",
            updatedAt:    new Date(),
          }).where(eq(vendorMobileAppsTable.id, record.id));
        }
        // "in_progress" → do nothing (callback handles "finished")
      } catch (err) {
        logger.error({ err, recordId: record.id }, "[mobile-app-scheduler] Error checking build");
      }
    }
  } catch (err) {
    logger.error({ err }, "[mobile-app-scheduler] Tick error");
  }
}

export function startMobileAppBuildScheduler(): void {
  logger.info("[mobile-app-scheduler] Started — polls every 5 minutes");
  // First tick after a short delay (let the server fully start)
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), POLL_INTERVAL_MS);
  }, 30_000);
}
