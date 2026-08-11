/**
 * Real email open-tracking events.
 *
 * Each outgoing email (campaign, support reply, birthday, announcement, etc.)
 * gets one row here with a unique token. The token is embedded in a 1×1
 * tracking pixel URL (`GET /api/track/pixel/:token`). When the pixel fires,
 * this row's openCount / firstOpenedAt / lastOpenedAt are updated, and the
 * parent campaign's openCount is incremented in the same query.
 *
 * Replaces the old hardcoded "22% of sentCount" simulation.
 */
import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const emailTrackingEventsTable = pgTable("email_tracking_events", {
  id: serial("id").primaryKey(),
  /** URL-safe random token used in the pixel URL — globally unique */
  token: text("token").notNull().unique("email_tracking_events_token_key"),
  /**
   * Originating email type for grouping/analytics:
   * "campaign" | "support_reply" | "platform_newsletter" | "birthday" |
   * "voice_campaign" | "announcement" | "trial_reminder" | other free-form
   */
  emailType: text("email_type").notNull(),
  /** FK to email_campaigns.id — null for non-campaign emails */
  campaignId: integer("campaign_id"),
  /** FK to vendors.id — null for platform-level emails */
  vendorId: integer("vendor_id"),
  /** FK to platform_contacts.id — null when contact not yet registered */
  platformContactId: integer("platform_contact_id"),
  /** FK to leads.id — null for platform emails or customers without a lead record */
  leadId: integer("lead_id"),
  recipientEmail: text("recipient_email").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }),
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
  openCount: integer("open_count").notNull().default(0),
});

export type EmailTrackingEvent = typeof emailTrackingEventsTable.$inferSelect;
