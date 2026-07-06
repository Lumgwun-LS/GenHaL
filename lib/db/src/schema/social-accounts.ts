import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendorsTable } from "./vendors";

export const socialAccountsTable = pgTable("social_accounts", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  accountName: text("account_name").notNull(),
  accountId: text("account_id"),
  profileUrl: text("profile_url"),
  avatarUrl: text("avatar_url"),
  status: text("status").notNull().default("active"),
  followersCount: integer("followers_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSocialAccountSchema = createInsertSchema(socialAccountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSocialAccount = z.infer<typeof insertSocialAccountSchema>;
export type SocialAccount = typeof socialAccountsTable.$inferSelect;
