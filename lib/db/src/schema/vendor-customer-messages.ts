import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";
import { customersTable } from "./customers";

/**
 * Direct messages between a vendor and their customers.
 * direction: 'vendor_to_customer' | 'customer_to_vendor'
 *
 * customer_id is nullable so vendors can message a customer even before
 * they have created an Awa Biz Suite account (identified only by email).
 */
export const vendorCustomerMessagesTable = pgTable("vendor_customer_messages", {
  id:            serial("id").primaryKey(),
  vendorId:      integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  customerId:    integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  customerEmail: text("customer_email").notNull(),
  customerName:  text("customer_name"),
  subject:       text("subject"),
  body:          text("body").notNull(),
  direction:     text("direction").notNull(), // 'vendor_to_customer' | 'customer_to_vendor'
  read:          boolean("read").notNull().default(false),
  readAt:        timestamp("read_at", { withTimezone: true }),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VendorCustomerMessage = typeof vendorCustomerMessagesTable.$inferSelect;
