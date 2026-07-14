import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

/**
 * Append-only history of every "Acknowledge & unblock" review for an
 * export burst, keyed by the flagged admin. Unlike
 * `adminExportAcknowledgmentsTable` (which only keeps the latest review so
 * the block-check can stay a single-row lookup), this table preserves every
 * past review so a compliance investigation into a flagged account can see
 * who cleared each burst and when, not just the most recent one.
 */
export const adminExportAcknowledgmentLogTable = pgTable("admin_export_acknowledgment_log", {
  id: serial("id").primaryKey(),
  adminUserId: text("admin_user_id").notNull(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedBy: text("acknowledged_by").notNull(),
  acknowledgedByDisplayName: text("acknowledged_by_display_name"),
});

export type AdminExportAcknowledgmentLog = typeof adminExportAcknowledgmentLogTable.$inferSelect;
