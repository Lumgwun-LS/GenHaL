import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sku: text("sku").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  costPrice: numeric("cost_price", { precision: 12, scale: 2 }),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(10),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
  status: text("status").notNull().default("active"),
  unit: text("unit"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
