import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Granular interaction events (menu clicks, button clicks, feature usage).
 * Fire-and-forget, fire from client side via POST /analytics/event.
 */
export const eventLogsTable = pgTable("event_logs", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  /** Event category: "nav_click" | "button_click" | "feature_use" | "search" */
  eventType: text("event_type").notNull(),
  /** Human-readable event name, e.g. "Dashboard", "Social Hub", "AI Studio" */
  eventName: text("event_name").notNull(),
  /** Current page path when the event fired */
  path: text("path"),
  sessionId: text("session_id"),
  /** Vendor if signed in */
  vendorId: integer("vendor_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
