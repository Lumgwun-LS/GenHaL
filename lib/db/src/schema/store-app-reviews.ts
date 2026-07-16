import { pgTable, text, serial, timestamp, integer, boolean, real } from "drizzle-orm/pg-core";
import { storeAppsTable } from "./store-apps";

export const storeAppReviewsTable = pgTable("store_app_reviews", {
  id: serial("id").primaryKey(),
  appId: integer("app_id").notNull().references(() => storeAppsTable.id, { onDelete: "cascade" }),
  reviewerClerkId: text("reviewer_clerk_id").notNull(),
  reviewerName: text("reviewer_name").notNull(),
  rating: integer("rating").notNull(),  // 1-5
  comment: text("comment"),
  // AI sentiment analysis
  sentimentScore: real("sentiment_score"),    // -1.0 to 1.0
  sentimentLabel: text("sentiment_label"),    // positive | neutral | negative | suspicious
  isFlagged: boolean("is_flagged").notNull().default(false),
  flagReason: text("flag_reason"),
  helpfulCount: integer("helpful_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
