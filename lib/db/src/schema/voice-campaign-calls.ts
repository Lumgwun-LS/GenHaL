import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { voiceCampaignsTable } from "./voice-campaigns";

/**
 * Individual call records within a voice campaign.
 * Each row = one outbound call to one lead.
 */
export const voiceCampaignCallsTable = pgTable("voice_campaign_calls", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => voiceCampaignsTable.id, { onDelete: "cascade" }),
  leadId: integer("lead_id"),        // optional reference to leads table
  leadName: text("lead_name").notNull(),
  phone: text("phone").notNull(),    // E.164
  status: text("status").notNull().default("queued"), // queued|ringing|in-progress|completed|no-answer|busy|failed|canceled
  durationSeconds: integer("duration_seconds"),
  callSid: text("call_sid"),
  initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VoiceCampaignCall = typeof voiceCampaignCallsTable.$inferSelect;
