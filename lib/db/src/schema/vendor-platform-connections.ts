import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";
import { platformPartnersTable } from "./platform-partners";

/**
 * Vendor–Platform connections.
 * When a vendor clicks "Connect" on a Platform Partner in the Marketplace,
 * their credential (API key or OAuth token) is stored here, scoped to
 * vendorId + partnerId.
 */
export const vendorPlatformConnectionsTable = pgTable("vendor_platform_connections", {
  id:            serial("id").primaryKey(),
  vendorId:      integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  partnerId:     integer("partner_id").notNull().references(() => platformPartnersTable.id, { onDelete: "cascade" }),

  // How the vendor authenticated with this platform
  authType:      text("auth_type").notNull().default("api_key"), // api_key | oauth

  // Stored credential — API key or OAuth access token (stored as-is; encrypt at rest if sensitive)
  credential:    text("credential"),

  // Connection health
  status:        text("status").notNull().default("active"),     // active | error | revoked
  lastSeenAt:    timestamp("last_seen_at", { withTimezone: true }),
  lastError:     text("last_error"),

  connectedAt:   timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VendorPlatformConnection = typeof vendorPlatformConnectionsTable.$inferSelect;
