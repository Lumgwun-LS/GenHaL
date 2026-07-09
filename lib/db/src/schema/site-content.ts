import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Generic key/value content store powering the no-code "Site Editor" admin
 * panel. Each row is a named content block (e.g. "landing.hero",
 * "site.settings", "email.birthday") whose `value` is an arbitrary JSON
 * object matching that block's shape (see DEFAULT_SITE_CONTENT on the
 * frontend/api-server for the authoritative shape per key).
 *
 * Missing keys fall back to hardcoded defaults, so the site always renders
 * correctly even before an admin edits anything.
 */
export const siteContentTable = pgTable("site_content", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SiteContent = typeof siteContentTable.$inferSelect;
