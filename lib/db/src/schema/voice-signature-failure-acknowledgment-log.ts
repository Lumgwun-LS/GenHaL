import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

/**
 * Append-only history of every "Acknowledge & clear" review of the Twilio
 * signature-failure burst alert, mirroring
 * `adminExportAcknowledgmentLogTable`. `voiceSignatureFailureAcknowledgmentsTable`
 * only keeps the latest review for the block/clear check; this table
 * preserves every past review for compliance/history purposes.
 */
export const voiceSignatureFailureAcknowledgmentLogTable = pgTable("voice_signature_failure_acknowledgment_log", {
  id: serial("id").primaryKey(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedBy: text("acknowledged_by").notNull(),
  acknowledgedByDisplayName: text("acknowledged_by_display_name"),
});

export type VoiceSignatureFailureAcknowledgmentLog = typeof voiceSignatureFailureAcknowledgmentLogTable.$inferSelect;
