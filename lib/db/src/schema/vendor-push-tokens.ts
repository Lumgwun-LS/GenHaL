import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

/**
 * Expo push tokens registered by the VendorHub Mobile app so the
 * api-server can send instant push notifications (e.g. payment status
 * changes) to a vendor's phone. A vendor may have multiple tokens
 * (multiple devices); the same physical device re-registering just
 * upserts its token's updatedAt.
 */
export const vendorPushTokensTable = pgTable("vendor_push_tokens", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  expoPushToken: text("expo_push_token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVendorPushTokenSchema = createInsertSchema(vendorPushTokensTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVendorPushToken = z.infer<typeof insertVendorPushTokenSchema>;
export type VendorPushToken = typeof vendorPushTokensTable.$inferSelect;
