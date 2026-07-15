import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";

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
  // Set exactly once, the first time a terminal status-callback is processed
  // for this call. Guards voice-minute reservation settlement against
  // Twilio's at-least-once callback delivery (retries/duplicates) double-
  // refunding the same call — see lib/usage.ts.
  meteredAt: timestamp("metered_at", { withTimezone: true }),
  // The voice-minute quota reservation made atomically before this call was
  // placed (see VOICE_CALL_RESERVATION_MINUTES in lib/usage.ts), and the
  // exact billing period it was reserved against. Both are captured at
  // reservation time — not re-derived later — so the status-callback
  // settlement always refunds the unused portion against the SAME period
  // the reservation was made in, even if the vendor's rolling period has
  // since rolled over (e.g. a tier change mid-call).
  reservedMinutes: numeric("reserved_minutes"),
  reservedPeriodStart: timestamp("reserved_period_start", { withTimezone: true }),
});

export type VoiceCallLog = typeof voiceCallLogsTable.$inferSelect;
