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
  // Multi-category support — up to 5; category above stays as the primary for search/filter compat
  categories: jsonb("categories").$type<string[]>().notNull().default([]),
  // platform: android | ios | web | all
  platform: text("platform").notNull().default("android"),
  iconUrl: text("icon_url").notNull(),
  // JSON array of screenshot URLs
  screenshots: jsonb("screenshots").$type<string[]>().notNull().default([]),
  // Required: direct download/install link (APK, App Store, Play Store, web)
  downloadUrl: text("download_url").notNull(),
  webUrl: text("web_url"),
  currentVersion: text("current_version"),
  // Stats
  totalDownloads: integer("total_downloads").notNull().default(0),
  rating: real("rating").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  // Status: draft | pending_payment | pending_review | approved | rejected | removed
  status: text("status").notNull().default("draft"),
  isFeatured: boolean("is_featured").notNull().default(false),
  // Publishing fee: NGN 25,000 per app
  publishingFeePaid: boolean("publishing_fee_paid").notNull().default(false),
  publishingFeeRef: text("publishing_fee_ref"),
  publishingFeeGateway: text("publishing_fee_gateway"),  // paystack | interswitch
  publishingFeeAmountKobo: integer("publishing_fee_amount_kobo"),
  // Package identifier — immutable after first set (e.g. com.example.myapp)
  packageName: text("package_name"),
  // Admin decision fields
  reviewedByClerkId: text("reviewed_by_clerk_id"),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  // AI analysis fields
  aiSummary: text("ai_summary"),
  aiCategory: text("ai_category"),
  aiPolicyFlags: text("ai_policy_flags"),
  aiReviewScore: real("ai_review_score"),
  aiReviewedAt: timestamp("ai_reviewed_at"),
  // First-party flag: set to true for apps published by Awajimaa itself.
  // These bypass the publishing fee and review queue and are auto-approved.
  isPlatformApp: boolean("is_platform_app").notNull().default(false),
  // Canonical public ID — encoded as {base36_timestamp}{owner_fingerprint}{random}
  // Maps to https://awajimaaappstore.com/app/{publicId}
  publicId: text("public_id").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
