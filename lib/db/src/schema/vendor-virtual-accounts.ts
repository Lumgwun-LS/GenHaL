/**
 * Dedicated / virtual bank accounts assigned to vendors or customers.
 * Supports Squad (NGN + USD) and Interswitch.
 * type: 'dynamic'   — single-use / session-scoped virtual account
 *       'dedicated' — persistent static account that always routes to this entity
 */
import { pgTable, serial, text, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";
import { customersTable } from "./customers";

export const vendorVirtualAccountsTable = pgTable("vendor_virtual_accounts", {
  id:            serial("id").primaryKey(),
  vendorId:      integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  gateway:       text("gateway").notNull(),           // 'squad' | 'interswitch'
  accountNumber: text("account_number").notNull(),
  bankCode:      text("bank_code"),
  bankName:      text("bank_name"),
  accountName:   text("account_name"),
  currency:      text("currency").notNull().default("NGN"),  // 'NGN' | 'USD'
  type:          text("type").notNull().default("dedicated"), // 'dynamic' | 'dedicated'
  referenceCode: text("reference_code"),              // gateway-side reference / customer_identifier
  isActive:      boolean("is_active").notNull().default(true),
  metadata:      jsonb("metadata"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customerVirtualAccountsTable = pgTable("customer_virtual_accounts", {
  id:            serial("id").primaryKey(),
  customerId:    integer("customer_id").references(() => customersTable.id, { onDelete: "cascade" }),
  customerEmail: text("customer_email").notNull(),
  gateway:       text("gateway").notNull(),
  accountNumber: text("account_number").notNull(),
  bankCode:      text("bank_code"),
  bankName:      text("bank_name"),
  accountName:   text("account_name"),
  currency:      text("currency").notNull().default("NGN"),
  type:          text("type").notNull().default("dedicated"),
  referenceCode: text("reference_code"),
  isActive:      boolean("is_active").notNull().default(true),
  metadata:      jsonb("metadata"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VendorVirtualAccount  = typeof vendorVirtualAccountsTable.$inferSelect;
export type CustomerVirtualAccount = typeof customerVirtualAccountsTable.$inferSelect;
