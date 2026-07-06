import { pgTable, text, serial, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const webhookEventsTable = pgTable(
  "webhook_events",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(), // "stripe" | "paystack"
    eventType: text("event_type").notNull(), // e.g. "checkout.session.completed"
    eventId: text("event_id").notNull(), // provider-supplied idempotency key
    reference: text("reference"), // payment reference / session ID (for quick lookup)
    rawPayload: jsonb("raw_payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }), // null = not yet processed or failed
    errorMessage: text("error_message"), // set when business logic throws; null = no error
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("webhook_events_event_id_unique").on(t.eventId)],
);

export const insertWebhookEventSchema = createInsertSchema(webhookEventsTable).omit({
  id: true,
  receivedAt: true,
});
export type InsertWebhookEvent = z.infer<typeof insertWebhookEventSchema>;
export type WebhookEvent = typeof webhookEventsTable.$inferSelect;
