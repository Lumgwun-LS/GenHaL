import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

/**
 * API keys created by individual vendors so third-party tools (Zapier, Make,
 * CRM apps, AI platforms, etc.) can authenticate directly to the /external/*
 * feature routes without requiring an OAuth flow.
 *
 * Format: awa_sk_<48 hex chars>
 * Only the SHA-256 hash is stored — the raw key is shown once at creation.
 */
export const vendorApiKeysTable = pgTable("vendor_api_keys", {
  id:         serial("id").primaryKey(),
  vendorId:   integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  name:       text("name").notNull(),                            // user-given label, e.g. "Zapier integration"
  keyHash:    text("key_hash").notNull().unique("vendor_api_keys_key_hash_key"),               // SHA-256 of the raw key
  prefix:     text("prefix").notNull(),                          // first 12 chars shown in the UI for identification
  scopes:     text("scopes").array().notNull().default(["read"]), // ["read"] | ["read","write"] | specific scopes
  isActive:   boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt:  timestamp("expires_at", { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt:  timestamp("revoked_at", { withTimezone: true }),
});

export type VendorApiKey = typeof vendorApiKeysTable.$inferSelect;
