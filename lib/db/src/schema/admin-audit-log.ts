import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const adminAuditLogTable = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  adminUserId: text("admin_user_id").notNull(),
  adminDisplayName: text("admin_display_name"),
  vendorId: integer("vendor_id").notNull(),
  field: text("field").notNull(),           // "subscriptionTier" | "verificationLevel" | "payment_conflict_resolution"
  oldValue: text("old_value").notNull(),
  newValue: text("new_value").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  /** For payment_conflict_resolution entries: the payment that was resolved. */
  paymentId: integer("payment_id"),
});

export type AdminAuditLog = typeof adminAuditLogTable.$inferSelect;
