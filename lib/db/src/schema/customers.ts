import { pgTable, text, serial, timestamp, boolean, date } from "drizzle-orm/pg-core";

/**
 * Awa Biz Suite customer accounts.
 * A customer is any Clerk-authenticated user who has purchased from a vendor
 * (or signed up via the customer portal). They are distinct from vendors.
 *
 * When profileCompleted = true, the customer unlocks the full
 * Awajimaa AI Dashboard (requires phone, country, city, address filled in).
 */
export const customersTable = pgTable("customers", {
  id:               serial("id").primaryKey(),
  clerkUserId:      text("clerk_user_id").notNull().unique(),
  email:            text("email").notNull(),
  name:             text("name").notNull(),
  phone:            text("phone"),
  avatarUrl:        text("avatar_url"),
  country:          text("country"),
  city:             text("city"),
  address:          text("address"),
  bio:              text("bio"),
  /** True once the customer has filled in phone + country + city → unlocks AI Dashboard */
  profileCompleted: boolean("profile_completed").notNull().default(false),
  /** Birthday for automated birthday calls and wishes */
  dateOfBirth: date("date_of_birth"),
  /** Opt out of automated birthday voice calls */
  voiceBirthdayOptOut: boolean("voice_birthday_opt_out").notNull().default(false),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Customer = typeof customersTable.$inferSelect;
