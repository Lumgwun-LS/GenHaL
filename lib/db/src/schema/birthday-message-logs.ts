import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * DB-level idempotency index (created via raw SQL migration — Drizzle ORM does
 * not support expression-based unique indexes in its schema DSL):
 *
 *   CREATE UNIQUE INDEX birthday_logs_vendor_channel_day_uniq
 *     ON birthday_message_logs (vendor_id, channel, DATE(sent_at AT TIME ZONE 'UTC'));
 *
 * This ensures at most one log row per vendor per channel per UTC calendar day,
 * so a server restart during the 08:00 UTC window cannot double-log.
 * The scheduler also does an explicit pre-insert check (belt-and-suspenders).
 */
export const birthdayMessageLogsTable = pgTable("birthday_message_logs", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull(),
  vendorName: text("vendor_name").notNull(),
  vendorEmail: text("vendor_email"),
  channel: text("channel").notNull(),
  // Vendor channels:   "in-app" | "email" | "email-failed"
  // Lead channels:     "lead-call" | "lead-in-app" | "lead-email" | "lead-email-failed"
  // Customer channels: "customer-call" | "customer-in-app" | "customer-email" | "customer-email-failed"
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  // Customer / lead birthday columns (null for vendor birthday rows)
  customerId: integer("customer_id"),
  leadId: integer("lead_id"),
  recipientName: text("recipient_name"),
  recipientEmail: text("recipient_email"),
});

export type BirthdayMessageLog = typeof birthdayMessageLogsTable.$inferSelect;
