import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { vendorsTable } from "./vendors";

export const inventoryTransactionsTable = pgTable("inventory_transactions", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "in" | "out" | "adjustment"
  quantity: integer("quantity").notNull(),
  notes: text("notes"),
  reference: text("reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInventoryTransactionSchema = createInsertSchema(inventoryTransactionsTable).omit({ id: true, createdAt: true });
export type InsertInventoryTransaction = z.infer<typeof insertInventoryTransactionSchema>;
export type InventoryTransaction = typeof inventoryTransactionsTable.$inferSelect;
