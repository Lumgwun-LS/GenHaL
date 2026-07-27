import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * Third-party applications registered to use the Awa Biz Suite OAuth 2.0 server.
 * A client here is an external app (Zapier, HubSpot, custom app, etc.) that wants
 * to request delegated access to a vendor's data.
 */
export const oauthClientsTable = pgTable("oauth_clients", {
  id:               serial("id").primaryKey(),
  name:             text("name").notNull(),
  description:      text("description"),
  websiteUrl:       text("website_url"),
  logoUrl:          text("logo_url"),
  clientId:         text("client_id").notNull().unique(),         // awa_ci_<hex>
  clientSecretHash: text("client_secret_hash").notNull(),        // SHA-256 of raw secret
  redirectUris:     text("redirect_uris").array().notNull(),     // allowed redirect URIs
  scopes:           text("scopes").array().notNull(),             // scopes this client may request
  isActive:         boolean("is_active").notNull().default(true),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OauthClient = typeof oauthClientsTable.$inferSelect;
