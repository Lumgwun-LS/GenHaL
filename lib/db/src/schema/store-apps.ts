import { pgTable, text, serial, timestamp, integer, boolean, real, jsonb } from "drizzle-orm/pg-core";
import { storeDeveloperAccountsTable } from "./store-developer-accounts";

export const storeAppsTable = pgTable("store_apps", {
  id: serial("id").primaryKey(),
  developerId: integer("developer_id").notNull().references(() => storeDeveloperAccountsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  tagline: text("tagline").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  // platform: android | ios | web | all
  platform: text("platform").notNull().default("android"),
  iconUrl: text("icon_url").notNull(),
  // JSON array of screenshot URLs
  screenshots: jsonb("screenshots").$type<string[]>().notNull().default([]),
  downloadUrl: text("download_url"),   // APK/AAB URL or App Store link
  webUrl: text("web_url"),             // Web app URL
  currentVersion: text("current_version"),
  // Stats
  totalDownloads: integer("total_downloads").notNull().default(0),
  rating: real("rating").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  // Status: draft | pending_review | approved | rejected | removed
  status: text("status").notNull().default("draft"),
  isFeatured: boolean("is_featured").notNull().default(false),
  // Admin decision fields
  reviewedByClerkId: text("reviewed_by_clerk_id"),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  // AI analysis fields
  aiSummary: text("ai_summary"),
  aiCategory: text("ai_category"),
  aiPolicyFlags: text("ai_policy_flags"),   // JSON array of flag strings, stored as text
  aiReviewScore: real("ai_review_score"),
  aiReviewedAt: timestamp("ai_reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
