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
  // OAuth-connected accounts (Meta/Facebook Pages + linked Instagram Business
  // accounts, a LinkedIn member profile, or an X/Twitter account) store their
  // access token here, encrypted the same way vendor payment credentials are
  // (see lib/encryption.ts). Manually registered accounts (legacy "just note
  // the handle" flow, still used for TikTok which has no OAuth flow yet) leave
  // this null and can never be used for live publishing.
  connectedVia: text("connected_via").notNull().default("manual"), // manual | oauth_meta | oauth_linkedin | oauth_twitter
  accessTokenEncrypted: text("access_token_encrypted"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  // Health-check bookkeeping for OAuth-connected accounts (currently just
  // Meta/Facebook+Instagram — see social-account-health.ts). `status` flips
  // to "needs_reconnect" on a validated -> invalid transition so publish
  // flows stop targeting it (posts.ts already filters status = "active");
  // these three columns track the transition itself for the admin/vendor
  // notice, mirroring platform_payment_credentials' failingSince pattern.
  lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
  lastHealthCheckError: text("last_health_check_error"),
  healthCheckFailingSince: timestamp("health_check_failing_since", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSocialAccountSchema = createInsertSchema(socialAccountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSocialAccount = z.infer<typeof insertSocialAccountSchema>;
export type SocialAccount = typeof socialAccountsTable.$inferSelect;
