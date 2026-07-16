import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";

/**
 * Deduplication table for export-burst Slack alerts.
 *
 * When an admin's export count crosses the burst threshold, we identify the
 * exact "crossing record" (the Nth export ordered by (exportedAt ASC, id ASC))
 * and INSERT a row here keyed by (adminUserId, crossingExportId).  The unique
 * constraint means only one concurrent request can win the INSERT; all others
 * receive a conflict and skip firing the alert.  This guarantees exactly one
 * Slack alert per burst even when two exports land simultaneously and cause the
 * running count to skip past the threshold value.
 */
export const adminExportBurstSentAlertsTable = pgTable(
  "admin_export_burst_sent_alerts",
  {
    id: serial("id").primaryKey(),
    adminUserId: text("admin_user_id").notNull(),
    /** id of the row in admin_export_logs that pushed the count to >= threshold */
    crossingExportId: integer("crossing_export_id").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqAdminCrossing: unique("uq_export_burst_alert").on(t.adminUserId, t.crossingExportId),
  }),
);

export type AdminExportBurstSentAlert = typeof adminExportBurstSentAlertsTable.$inferSelect;
