import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";
import { branchesTable } from "./branches";
import { workersTable } from "./workers";

/**
 * Covers both owner-capital tracking (money the owner puts into or lends the
 * business) and external investments/assets the business holds. `currentValue`
 * lets external assets (and owner equity) show a return/ROI over the original
 * `amount`; for capital/loans it's typically left equal to amount unless the
 * vendor updates it.
 */
export const investmentsTable = pgTable("investments", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "set null" }),
  workerId: integer("worker_id").references(() => workersTable.id, { onDelete: "set null" }),
  type: text("type").notNull(), // "owner_capital" | "loan" | "external_asset"
  name: text("name").notNull(),
  notes: text("notes"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currentValue: numeric("current_value", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull().default("active"), // "active" | "closed"
  investmentDate: timestamp("investment_date", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInvestmentSchema = createInsertSchema(investmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;
export type Investment = typeof investmentsTable.$inferSelect;
