import { pgTable, text, serial, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";
import { branchesTable } from "./branches";
import { workersTable } from "./workers";
import { postsTable } from "./posts";
// Forward-reference — customersTable is defined after ordersTable in schema load order
// so we reference the table name as a string to avoid circular imports.
import { customersTable } from "./customers";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  /** Linked customer account — set when a customer claims or places the order while signed in */
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "set null" }),
  workerId: integer("worker_id").references(() => workersTable.id, { onDelete: "set null" }),
  // Set only for orders placed through a public "shop this post" link — scopes
  // that link's own status/retry endpoints to exactly the order(s) it created,
  // so a valid shop token for one post can't be used to probe or retry a
  // different order (even one for the same vendor) by guessing its id.
  sourcePostId: integer("source_post_id").references(() => postsTable.id, { onDelete: "set null" }),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone"),
  status: text("status").notNull().default("pending"),
  paymentStatus: text("payment_status").notNull().default("unpaid"), // unpaid | paid | failed | refunded
  currency: text("currency").notNull().default("USD"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  shippingAddress: text("shipping_address"),
  /** Channel that created this order — 'embed' for embedded widget orders, null for dashboard-created */
  source: text("source"),
  /** True once stock has been decremented for this order — prevents double-decrement on webhook retries */
  stockApplied: boolean("stock_applied").notNull().default(false),
  /** Set once a cart-abandonment reminder email has been sent — prevents duplicate sends */
  cartReminderSentAt: timestamp("cart_reminder_sent_at", { withTimezone: true }),
  // ── Fulfillment / delivery tracking ────────────────────────────────────────
  /** pending | processing | shipped | out_for_delivery | delivered | confirmed | disputed */
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  /** Timestamp when the customer clicked "I received this" via their receipt link */
  customerConfirmedAt: timestamp("customer_confirmed_at", { withTimezone: true }),
  /** Vendor's note explaining a refund (displayed to customer) */
  refundNote: text("refund_note"),
  /** Unique token emailed to customer so they can confirm receipt without an account */
  receiptToken: text("receipt_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
