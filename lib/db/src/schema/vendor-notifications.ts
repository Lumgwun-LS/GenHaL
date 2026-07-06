import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

/**
 * DB-level idempotency index (created via raw SQL migration — Drizzle ORM does
 * not support expression-based partial unique indexes in its schema DSL):
 *
 *   CREATE UNIQUE INDEX vendor_notifications_birthday_day_uniq
 *     ON vendor_notifications (vendor_id, DATE(created_at AT TIME ZONE 'UTC'))
 *     WHERE type = 'birthday';
 *
 * This ensures at most one birthday notification per vendor per UTC calendar day.
 * The scheduler also does an explicit pre-insert check so that `insert` is never
 * reached for an already-notified vendor (belt-and-suspenders).
 */
export const vendorNotificationsTable = pgTable("vendor_notifications", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),       // "birthday" | "tier_change" | "general"
  message: text("message").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VendorNotification = typeof vendorNotificationsTable.$inferSelect;
