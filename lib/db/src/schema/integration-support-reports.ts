import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";
import { integrationErrorLogsTable } from "./integration-error-logs";

/**
 * A vendor-submitted support ticket for an integration error.
 * Admins triage these, add a resolution note, and mark them resolved —
 * at which point the vendor gets an in-app notification + email.
 *
 * Status lifecycle:  open → in_progress → resolved
 */
export const integrationSupportReportsTable = pgTable("integration_support_reports", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  /** Optionally linked to an auto-captured error log entry for full context. */
  errorLogId: integer("error_log_id").references(() => integrationErrorLogsTable.id, { onDelete: "set null" }),
  platform: text("platform").notNull(),         // same enum as integration_error_logs
  /** Vendor's own description of what went wrong. */
  description: text("description").notNull(),
  /** open | in_progress | resolved */
  status: text("status").notNull().default("open"),
  /** Admin's note to the vendor (shown when resolved). */
  adminNote: text("admin_note"),
  /**
   * Required when marking a report as "fix_deployed" or "resolved".
   * Must describe exactly what was changed in the code — prevents admins
   * from closing reports without a real fix in place.
   */
  fixDescription: text("fix_description"),
  /** Clerk user id of the admin who last updated the report. */
  resolvedByAdminId: text("resolved_by_admin_id"),
  resolvedByAdminName: text("resolved_by_admin_name"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  /** Set when the vendor's resolution notification was dispatched (email + push). */
  vendorNotifiedAt: timestamp("vendor_notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type IntegrationSupportReport = typeof integrationSupportReportsTable.$inferSelect;
export type NewIntegrationSupportReport = typeof integrationSupportReportsTable.$inferInsert;
