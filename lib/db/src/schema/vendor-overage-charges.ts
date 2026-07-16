import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

export const vendorOverageChargesTable = pgTable("vendor_overage_charges", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendorsTable.id, { onDelete: "cascade" }),
  resource: text("resource").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  units: numeric("units", { precision: 14, scale: 2 }).notNull().default("0"),
  unitRateUsd: numeric("unit_rate_usd", { precision: 10, scale: 4 }).notNull(),
  totalUsd: numeric("total_usd", { precision: 10, scale: 4 }).notNull(),
  stripeInvoiceItemId: text("stripe_invoice_item_id"),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VendorOverageCharge = typeof vendorOverageChargesTable.$inferSelect;
export type NewVendorOverageCharge = typeof vendorOverageChargesTable.$inferInsert;
