import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

/**
 * History of every edit to a `site_content` block, keyed by content key
 * (e.g. "admin.exportAlertSettings"). Unlike `siteContentTable` itself,
 * which only keeps the current value + last editor, this table is
 * append-only so admin-sensitive settings (like the export-burst alert
 * threshold, a PII-exfiltration detector) can answer "who changed this and
 * when" across their full history, not just the most recent edit.
 */
export const siteContentAuditLogTable = pgTable("site_content_audit_log", {
  id: serial("id").primaryKey(),
  contentKey: text("content_key").notNull(),
  adminUserId: text("admin_user_id").notNull(),
  adminDisplayName: text("admin_display_name"),
  oldValue: text("old_value").notNull(), // JSON-encoded previous block value
  newValue: text("new_value").notNull(), // JSON-encoded new block value
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SiteContentAuditLog = typeof siteContentAuditLogTable.$inferSelect;
