import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { postsTable } from "./posts";
import { socialAccountsTable } from "./social-accounts";

/**
 * One row per per-platform publish attempt for a post. A single "Publish" click
 * can target several platforms at once and each can independently succeed or
 * fail (e.g. Facebook posts fine but Instagram has no connected account) — this
 * table is what lets the UI show that per-platform outcome instead of a single
 * pass/fail for the whole post.
 */
export const postPublicationsTable = pgTable("post_publications", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  socialAccountId: integer("social_account_id").references(() => socialAccountsTable.id, { onDelete: "set null" }),
  platform: text("platform").notNull(),
  status: text("status").notNull(), // success | failed
  externalPostId: text("external_post_id"),
  externalUrl: text("external_url"),
  errorMessage: text("error_message"),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPostPublicationSchema = createInsertSchema(postPublicationsTable).omit({ id: true, publishedAt: true });
export type InsertPostPublication = z.infer<typeof insertPostPublicationSchema>;
export type PostPublication = typeof postPublicationsTable.$inferSelect;
