import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const blogCommenterBansTable = pgTable("blog_commenter_bans", {
  id:            serial("id").primaryKey(),
  vendorId:      integer("vendor_id").notNull(),
  commenterEmail: text("commenter_email").notNull(),
  reason:        text("reason"),
  bannedAt:      timestamp("banned_at", { withTimezone: true }).notNull().defaultNow(),
});
