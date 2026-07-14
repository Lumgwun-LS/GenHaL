import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

/**
 * Singleton-style acknowledgment of the Twilio signature-failure burst
 * alert (the alert itself is a single global flag, not per-admin, since it
 * reflects one shared TWILIO_AUTH_TOKEN). Tracks the last time an admin
 * reviewed and cleared a flagged burst ("I rotated TWILIO_AUTH_TOKEN, this
 * is resolved"). The banner stays cleared until either:
 *  - a fresh burst crosses the threshold again *after* `acknowledgedAt`, or
 *  - the previously-flagging failures age out of the alert window.
 * Only one row should ever exist; it is upserted by primary key id = 1.
 */
export const voiceSignatureFailureAcknowledgmentsTable = pgTable("voice_signature_failure_acknowledgments", {
  id: serial("id").primaryKey(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedBy: text("acknowledged_by").notNull(),
});

export type VoiceSignatureFailureAcknowledgment = typeof voiceSignatureFailureAcknowledgmentsTable.$inferSelect;
