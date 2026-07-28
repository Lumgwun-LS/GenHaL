import { pgTable, text, serial, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";

/**
 * In-app inbox for customer accounts.
 * Types: order_confirmed | order_shipped | order_failed | promo | system
 */
export const customerNotificationsTable = pgTable("customer_notifications", {
  id:         serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  type:       text("type").notNull(),   // order_confirmed | order_shipped | order_failed | promo | system
  title:      text("title").notNull(),
  message:    text("message").notNull(),
  read:       boolean("read").notNull().default(false),
  metadata:   jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CustomerNotification = typeof customerNotificationsTable.$inferSelect;
