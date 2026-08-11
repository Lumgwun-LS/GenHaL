import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  caption: text("caption").notNull(),
  platforms: text("platforms").array().notNull().default([]),
  // Aligned by index with `platforms`: which connected social_accounts row to publish
  // each platform entry to. Null/missing entries fall back to "the one active account
  // for that platform" at publish time, and publish fails explicitly if that's ambiguous.
  socialAccountIds: integer("social_account_ids").array().default([]),
  status: text("status").notNull().default("draft"),
  // Set true when the scheduled-post auto-publisher (post-scheduler.ts) reverts
  // this post to "approved" because every platform failed — lets the Social Hub
  // flag it distinctly from a normal draft/approved post, since otherwise the
  // failure is silent until the vendor happens to check. Cleared on successful
  // publish or when the post is (re)scheduled.
  autoPublishFailed: boolean("auto_publish_failed").notNull().default(false),
  mediaUrls: text("media_urls").array().notNull().default([]),
  mediaType: text("media_type"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  // Set once the pre-publish reminder (push/email) has gone out for the post's
  // current `scheduledAt`. Cleared whenever scheduledAt changes (reschedule) so
  // the vendor gets a fresh reminder ahead of the new time — see post-reminders.ts.
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
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
