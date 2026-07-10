import { pgTable, text, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Tracks which "pending item" reminder emails have already been sent, so a
 * vendor gets exactly one nudge per pending post/payment rather than a fresh
 * email every time the background job ticks while the item is still pending.
 */
export const pendingReminderLogsTable = pgTable(
  "pending_reminder_logs",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull(),
    itemType: text("item_type").notNull(), // "post" | "payment"
    itemId: integer("item_id").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("pending_reminder_logs_item_uniq").on(t.itemType, t.itemId)],
);

export const insertPendingReminderLogSchema = createInsertSchema(pendingReminderLogsTable).omit({
  id: true,
  sentAt: true,
});
export type InsertPendingReminderLog = z.infer<typeof insertPendingReminderLogSchema>;
export type PendingReminderLog = typeof pendingReminderLogsTable.$inferSelect;
