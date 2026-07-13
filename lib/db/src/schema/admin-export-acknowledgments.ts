import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

/**
 * One row per admin, tracking the last time someone (typically a different
 * admin) reviewed and cleared an export-burst flag for that admin. Further
 * exports from a flagged admin are blocked (429) until either:
 *  - `acknowledgedAt` is at/after the export that pushed them over the
 *    threshold (i.e. this row was refreshed after the burst was flagged), or
 *  - the burst naturally ages out of the alert window.
 */
export const adminExportAcknowledgmentsTable = pgTable("admin_export_acknowledgments", {
  id: serial("id").primaryKey(),
  adminUserId: text("admin_user_id").notNull().unique(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedBy: text("acknowledged_by").notNull(),
});

export type AdminExportAcknowledgment = typeof adminExportAcknowledgmentsTable.$inferSelect;
