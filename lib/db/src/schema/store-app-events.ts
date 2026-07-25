import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { storeAppsTable } from "./store-apps";

/**
 * Per-app event log: view (click), install (download), uninstall.
 * No PII — clerkUserId is optional and stored only when the user is signed in.
 */
export const storeAppEventsTable = pgTable("store_app_events", {
  id:           serial("id").primaryKey(),
  appId:        integer("app_id").notNull().references(() => storeAppsTable.id, { onDelete: "cascade" }),
  eventType:    text("event_type").notNull(),   // "view" | "install" | "uninstall"
  sessionId:    text("session_id"),
  clerkUserId:  text("clerk_user_id"),
  country:      text("country"),               // ISO-3166 alpha-2, e.g. "NG"
  region:       text("region"),               // state / province, e.g. "Lagos"
  city:         text("city"),                 // city, e.g. "Ikeja"
  userAgent:    text("user_agent"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
});
