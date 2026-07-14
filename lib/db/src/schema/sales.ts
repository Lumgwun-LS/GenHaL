import { pgTable, text, serial, timestamp, integer, numeric, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";
import { paymentsTable } from "./payments";

/**
 * Unified sales ledger. Rows come from two sources:
 *  - "manual": entered directly by the vendor (e.g. a cash sale not tied to an order).
 *  - "order_payment": auto-synced whenever a payment transitions to "paid" (see
 *    lib/sales-sync.ts). sourcePaymentId is unique so a payment can only ever
 *    produce one sales row, no matter how many times the transition handler runs.
 * Only "manual" rows are editable/deletable from the UI or API.
 */
export const salesTable = pgTable("sales", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("manual"), // "manual" | "order_payment"
  sourcePaymentId: integer("source_payment_id").references(() => paymentsTable.id, { onDelete: "set null" }),
  description: text("description"),
  customerName: text("customer_name"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  saleDate: timestamp("sale_date", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ([
  unique("sales_source_payment_id_unique").on(table.sourcePaymentId),
]));

export const insertSaleSchema = createInsertSchema(salesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof salesTable.$inferSelect;
