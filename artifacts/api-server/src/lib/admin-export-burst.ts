/**
 * Shared export-burst detection helpers used by every admin CSV export
 * endpoint. Extracted here so admin.ts (vendor export) and
 * admin-analytics.ts (finance-rollup export) can share the same logic
 * without circular imports.
 */
import { db, adminExportLogsTable, adminExportAcknowledgmentsTable, adminExportBurstSentAlertsTable } from "@workspace/db";
import { eq, and, gte, asc, desc } from "drizzle-orm";
import { getSiteContentBlock } from "./site-content";
import { sendSlackAlert } from "./slack";

export async function getExportAlertSettings(): Promise<{ threshold: number; windowMinutes: number }> {
  const raw = await getSiteContentBlock("admin.exportAlertSettings");
  return raw as { threshold: number; windowMinutes: number };
}

/**
 * Determines whether `adminUserId` is currently mid-burst and should be
 * blocked from exporting further.
 */
export async function getExportBurstStatus(
  adminUserId: string,
): Promise<{ blocked: boolean; count: number; threshold: number; windowMinutes: number; flaggedAt: Date | null }> {
  const { threshold, windowMinutes } = await getExportAlertSettings();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  const recent = await db
    .select({ exportedAt: adminExportLogsTable.exportedAt })
    .from(adminExportLogsTable)
    .where(and(eq(adminExportLogsTable.adminUserId, adminUserId), gte(adminExportLogsTable.exportedAt, windowStart)))
    .orderBy(desc(adminExportLogsTable.exportedAt));

  const count = recent.length;
  if (count < threshold) {
    return { blocked: false, count, threshold, windowMinutes, flaggedAt: null };
  }

  const flaggedAt = recent[threshold - 1]!.exportedAt;

  const [ack] = await db
    .select()
    .from(adminExportAcknowledgmentsTable)
    .where(eq(adminExportAcknowledgmentsTable.adminUserId, adminUserId));

  const cleared = Boolean(ack) && ack!.acknowledgedAt >= flaggedAt;
  return { blocked: !cleared, count, threshold, windowMinutes, flaggedAt };
}

/**
 * Fires a Slack alert exactly once per burst crossing. See admin.ts for full
 * concurrency-safety explanation.
 */
export async function checkExportBurst(adminUserId: string): Promise<void> {
  const { threshold, windowMinutes } = await getExportAlertSettings();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  const recent = await db
    .select({ id: adminExportLogsTable.id })
    .from(adminExportLogsTable)
    .where(and(eq(adminExportLogsTable.adminUserId, adminUserId), gte(adminExportLogsTable.exportedAt, windowStart)))
    .orderBy(asc(adminExportLogsTable.exportedAt), asc(adminExportLogsTable.id));

  const count = recent.length;
  if (count < threshold) return;

  const crossingExportId = recent[threshold - 1]!.id;

  const claimed = await db
    .insert(adminExportBurstSentAlertsTable)
    .values({ adminUserId, crossingExportId })
    .onConflictDoNothing()
    .returning({ id: adminExportBurstSentAlertsTable.id });

  if (claimed.length > 0) {
    await sendSlackAlert(
      `:rotating_light: Admin *${adminUserId}* has downloaded a data export ${count} times in the last ${windowMinutes} minutes. Further exports from this account are paused until another admin reviews and clears it in the Admin Panel.`,
    );
  }
}
