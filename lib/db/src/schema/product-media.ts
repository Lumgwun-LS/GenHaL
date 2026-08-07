import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { vendorsTable } from "./vendors";

/**
 * product_media — multiple images and videos per product.
 * sortOrder controls display order (lower = first).
 * isPrimary marks the "hero" image used in listings and share cards;
 *   exactly one row per product should have isPrimary = true.
 */
export const productMediaTable = pgTable("product_media", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  /** "image" | "video" */
  type: text("type").notNull().default("image"),
  url: text("url").notNull(),
  /** Optional alt text / video caption */
  caption: text("caption"),
  sortOrder: integer("sort_order").notNull().default(0),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductMedia = typeof productMediaTable.$inferSelect;
