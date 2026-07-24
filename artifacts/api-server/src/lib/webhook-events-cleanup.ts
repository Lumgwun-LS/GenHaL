/**
 * Periodic cleanup for the webhook_events deduplication table.
 *
 * The table grows without bound because only stale in-progress sentinels are
 * ever reset — old processed/failed rows are never removed. This job deletes
 * rows older than RETENTION_DAYS so the table stays manageable over time.
 *
 * Safety: the only purpose of old rows is deduplication. After RETENTION_DAYS
 * we assume any replay of that event is either impossible (Stripe/Paystack stop
 * retrying within days) or acceptable to reprocess (the underlying handlers are
 * idempotent). 90 days is far beyond any provider's retry window.
 */
import { db } from "@workspace/db";
import { webhookEventsTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { recordJobRun } from "./job-run-status";

const RETENTION_DAYS = 90;
const INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
export const WEBHOOK_EVENTS_CLEANUP_JOB_NAME = "webhook-events-cleanup";

async function tick(): Promise<void> {
  try {
    const result = await db
      .delete(webhookEventsTable)
      .where(sql`${webhookEventsTable.receivedAt} < NOW() - INTERVAL '${sql.raw(String(RETENTION_DAYS))} days'`)
      .returning({ id: webhookEventsTable.id });

    const deleted = result.length;
    logger.info({ deleted, retentionDays: RETENTION_DAYS }, "[webhook-cleanup] Pruned old webhook events");
    await recordJobRun(WEBHOOK_EVENTS_CLEANUP_JOB_NAME, { success: true, affectedCount: deleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "[webhook-cleanup] Failed to prune webhook events");
    await recordJobRun(WEBHOOK_EVENTS_CLEANUP_JOB_NAME, { success: false, error: message });
  }
}

/** Starts the daily webhook_events cleanup. Runs once immediately on boot. */
export function startWebhookEventsCleanup(): void {
  tick().catch(() => {});
  setInterval(() => tick().catch(() => {}), INTERVAL_MS);
  logger.info(
    { retentionDays: RETENTION_DAYS },
    "[webhook-cleanup] Webhook events cleanup started — runs daily",
  );
}
