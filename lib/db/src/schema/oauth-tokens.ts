import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

/**
 * OAuth 2.0 tokens — covers both authorization codes (short-lived, single-use)
 * and access tokens (longer-lived, for /external/* API calls).
 *
 * tokenType:
 *   "authorization_code" — set usedAt when exchanged; expires in 10 minutes
 *   "access_token"       — set revokedAt to invalidate; expires in 30 days
 */
export const oauthTokensTable = pgTable("oauth_tokens", {
  id:         serial("id").primaryKey(),
  vendorId:   integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  clientId:   text("client_id").notNull(),
  tokenHash:  text("token_hash").notNull().unique(),
  tokenType:  text("token_type").notNull().default("access_token"),
  scopes:     text("scopes").array().notNull(),
  expiresAt:  timestamp("expires_at", { withTimezone: true }),
  usedAt:     timestamp("used_at", { withTimezone: true }),   // auth codes only
  revokedAt:  timestamp("revoked_at", { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OauthToken = typeof oauthTokensTable.$inferSelect;
