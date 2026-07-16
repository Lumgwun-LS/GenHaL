import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Lightweight page-view events recorded from every Awajimaa platform.
 * Fire-and-forget — no PII, no auth required.
 */
export const pageViewsTable = pgTable("page_views", {
  id: serial("id").primaryKey(),
  /** "vendor-hub" | "app-store" | "mobile" */
  platform: text("platform").notNull(),
  path: text("path").notNull(),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  /** Random UUID generated client-side, stored in sessionStorage — not tied to identity. */
  sessionId: text("session_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
