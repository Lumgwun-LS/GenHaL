import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * Customer ratings submitted for a vendor after an order.
 * Shown publicly on the vendor's storefront and visible to the super admin.
 */
export const vendorRatingsTable = pgTable("vendor_ratings", {
  id:                  serial("id").primaryKey(),
  vendorId:            integer("vendor_id").notNull(),
  orderId:             integer("order_id"),
  customerId:          integer("customer_id"),
  customerName:        text("customer_name"),
  customerEmail:       text("customer_email"),
  rating:              integer("rating").notNull(),   // 1–5 stars
  review:              text("review"),
  isPublic:            boolean("is_public").notNull().default(true),
  isVerifiedPurchase:  boolean("is_verified_purchase").notNull().default(false),
  isFlagged:           boolean("is_flagged").notNull().default(false),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
});
