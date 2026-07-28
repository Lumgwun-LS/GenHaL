import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

/**
 * Lightweight visit tracking for embedded storefronts.
 * No cookies, no PII — just vendor key + referrer domain + session ID.
 * sessionId is generated in the browser (random UUID stored in sessionStorage)
 * to deduplicate same-session pings.
 */
export const embedVisitsTable = pgTable("embed_visits", {
  id:             serial("id").primaryKey(),
  vendorId:       integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  /** eTLD+1 of the page that loaded the embed widget (e.g. "example.com"). */
  referrerDomain: text("referrer_domain"),
  /** Random UUID generated in the browser's sessionStorage — one per tab/session. */
  sessionId:      text("session_id"),
  visitedAt:      timestamp("visited_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("embed_visits_vendor_visited_at").on(t.vendorId, t.visitedAt),
  index("embed_visits_session").on(t.sessionId),
]);

export type EmbedVisit = typeof embedVisitsTable.$inferSelect;
