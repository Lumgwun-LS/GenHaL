import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

/**
 * One row per Clerk user who has ever touched the platform — whether or not
 * they completed vendor onboarding. Populated via JIT upsert on every
 * authenticated API call so incomplete sign-ups are always captured.
 */
export const platformUsersTable = pgTable("platform_users", {
  id:                   serial("id").primaryKey(),
  clerkUserId:          text("clerk_user_id").notNull().unique("platform_users_clerk_user_id_key"),
  email:                text("email"),
  name:                 text("name"),
  phone:                text("phone"),
  imageUrl:             text("image_url"),
  /** true once a vendors row exists for this Clerk user */
  onboardingCompleted:  boolean("onboarding_completed").notNull().default(false),
  /** FK set when onboarding completes; null for pre-onboarding users */
  vendorId:             integer("vendor_id").references(() => vendorsTable.id, { onDelete: "set null" }),
  firstSeenAt:          timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt:           timestamp("last_seen_at",  { withTimezone: true }).notNull().defaultNow(),
});
