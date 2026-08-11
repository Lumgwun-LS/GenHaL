import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/** Tracks the first time a Clerk user interacts with the App Store (authenticated). */
export const storeUserSignupsTable = pgTable("store_user_signups", {
  id:          serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique("store_user_signups_clerk_user_id_key"),
  email:       text("email"),
  displayName: text("display_name"),
  country:     text("country"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});
