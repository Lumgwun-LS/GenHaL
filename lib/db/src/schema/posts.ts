import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  caption: text("caption").notNull(),
  platforms: text("platforms").array().notNull().default([]),
  status: text("status").notNull().default("draft"),
  mediaUrls: text("media_urls").array().notNull().default([]),
  mediaType: text("media_type"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  hashtags: text("hashtags"),
  aiGenerated: boolean("ai_generated").notNull().default(false),
  productIds: integer("product_ids").array().notNull().default([]),
  linkMode: text("link_mode").notNull().default("none"), // none | interest | checkout
  shareToken: text("share_token").unique(),
  engagementData: text("engagement_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;
