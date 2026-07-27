import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

/**
 * Lightweight page-view events recorded from every Awajimaa platform.
 * Fire-and-forget — no PII beyond vendorId (optional). Captures rich
 * context for visitor intelligence: traffic source, country, device,
 * browser, auth status, UTM campaign data.
 */
export const pageViewsTable = pgTable("page_views", {
  id: serial("id").primaryKey(),
  /** "vendor-hub" | "app-store" | "mobile" */
  platform: text("platform").notNull(),
  path: text("path").notNull(),
  referrer: text("referrer"),
  /** Parsed traffic source label: "Google", "Facebook", "Direct", "Instagram", etc. */
  trafficSource: text("traffic_source"),
  userAgent: text("user_agent"),
  /** Parsed from userAgent: "mobile" | "tablet" | "desktop" */
  device: text("device"),
  /** Parsed from userAgent: "Chrome" | "Firefox" | "Safari" | "Edge" | "Opera" | "other" */
  browser: text("browser"),
  /** Parsed from userAgent: "iOS" | "Android" | "Windows" | "macOS" | "Linux" | "other" */
  os: text("os"),
  /** Country inferred from CF-IPCountry header or Accept-Language locale tag */
  country: text("country"),
  /** IANA timezone string from Intl.DateTimeFormat (e.g. "Africa/Lagos") */
  timezone: text("timezone"),
  /** utm_source query param */
  utmSource: text("utm_source"),
  /** utm_medium query param */
  utmMedium: text("utm_medium"),
  /** utm_campaign query param */
  utmCampaign: text("utm_campaign"),
  /** utm_content query param */
  utmContent: text("utm_content"),
  /** Whether the user was signed in when this view was recorded */
  isAuthenticated: boolean("is_authenticated").default(false),
  /** The vendorId of the signed-in vendor (if applicable) */
  vendorId: integer("vendor_id"),
  /** Random UUID generated client-side, stored in sessionStorage — not tied to identity. */
  sessionId: text("session_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
