import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

/**
 * Records every time a Twilio voice status-callback request is rejected for
 * a signature/config reason (missing header, missing TWILIO_AUTH_TOKEN, or
 * signature mismatch). A sustained burst of these — especially "mismatch" —
 * almost always means the Auth Token was rotated in the Twilio console and
 * TWILIO_AUTH_TOKEN in Replit Secrets is now stale, so every real call status
 * update is being silently dropped.
 */
export const voiceSignatureFailuresTable = pgTable("voice_signature_failures", {
  id: serial("id").primaryKey(),
  reason: text("reason").notNull(), // "missing_config" | "missing_signature" | "invalid_signature"
  callSid: text("call_sid"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VoiceSignatureFailure = typeof voiceSignatureFailuresTable.$inferSelect;
