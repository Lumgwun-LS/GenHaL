import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Records every outbound voice call placed by the platform.
 * Used by: birthday scheduler (06:00 UTC), vendor campaign launcher.
 *
 * status values mirror Twilio call statuses:
 *   queued | ringing | in-progress | completed | no-answer | busy | failed | canceled
 */
export const voiceCallLogsTable = pgTable("voice_call_logs", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id"),             // null for campaign-only calls
  campaignId: integer("campaign_id"),         // null for birthday calls
  phone: text("phone").notNull(),             // E.164 destination number
  direction: text("direction").notNull().default("outbound"),
  purpose: text("purpose").notNull(),         // "birthday" | "campaign"
  status: text("status").notNull().default("queued"), // Twilio call status
  durationSeconds: integer("duration_seconds"),
  callSid: text("call_sid"),                  // Twilio call SID for lookup
  initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VoiceCallLog = typeof voiceCallLogsTable.$inferSelect;
