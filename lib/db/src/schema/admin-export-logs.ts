import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const adminExportLogsTable = pgTable("admin_export_logs", {
  id: serial("id").primaryKey(),
  adminUserId: text("admin_user_id").notNull(),
  filters: text("filters").notNull(), // JSON-encoded filter params used for the export
  rowCount: integer("row_count").notNull(),
  exportedAt: timestamp("exported_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminExportLog = typeof adminExportLogsTable.$inferSelect;
