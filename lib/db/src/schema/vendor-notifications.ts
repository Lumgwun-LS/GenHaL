import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
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
  type: text("type").notNull(),       // "birthday" | "tier_change" | "verification_change" | "general"
  message: text("message").notNull(),
  adminUserId: text("admin_user_id"),           // Clerk user id of sender, for admin-originated notifications (e.g. "general")
  adminDisplayName: text("admin_display_name"), // Resolved display name at send time, so history reads correctly even if the admin's Clerk profile changes later
  previousTier: text("previous_tier"), // Structured tier values for "tier_change" notifications caused by an actual subscriptionTier change, so the admin panel can render a clean history without parsing `message`. Null for other notification types (e.g. birthday, general, verification_change).
  newTier: text("new_tier"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /**
   * Set to true when a bulk-announcement email failed to deliver for this vendor
   * (reason = "send_failed"). Cleared to false once a retry succeeds. Null for
   * non-bulk or non-email notifications (birthday, tier_change, etc.).
   */
  emailFailed: boolean("email_failed"),
});

export type VendorNotification = typeof vendorNotificationsTable.$inferSelect;
