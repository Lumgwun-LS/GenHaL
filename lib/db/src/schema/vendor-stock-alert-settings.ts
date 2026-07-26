import { pgTable, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

export const vendorStockAlertSettingsTable = pgTable("vendor_stock_alert_settings", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().unique().references(() => vendorsTable.id, { onDelete: "cascade" }),
  alert60Enabled: boolean("alert_60_enabled").notNull().default(true),
  alert40Enabled: boolean("alert_40_enabled").notNull().default(true),
  alert20Enabled: boolean("alert_20_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type VendorStockAlertSettings = typeof vendorStockAlertSettingsTable.$inferSelect;
