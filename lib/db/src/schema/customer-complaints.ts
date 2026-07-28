import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Complaints submitted by customers after a deal/order.
 * Visible to the super admin; not public.
 */
export const customerComplaintsTable = pgTable("customer_complaints", {
  id:            serial("id").primaryKey(),
  vendorId:      integer("vendor_id").notNull(),
  orderId:       integer("order_id"),
  customerId:    integer("customer_id"),
  customerName:  text("customer_name"),
  customerEmail: text("customer_email").notNull(),
  subject:       text("subject").notNull(),
  body:          text("body").notNull(),
  status:        text("status").notNull().default("open"),   // open|in_review|resolved|dismissed
  adminNote:     text("admin_note"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
});
