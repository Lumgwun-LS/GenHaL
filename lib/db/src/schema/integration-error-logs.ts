import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

/**
 * Auto-captured record of every external API failure that touches a vendor's
 * account. Written by `logIntegrationError()` in api-server/lib/integration-errors.ts.
 * Never throws — logging errors are swallowed so the originating request is not
 * disrupted.
 *
 * Platforms: meta | linkedin | x_twitter | paystack | stripe | paypal |
 *            flutterwave | nomba | remita | twilio | elevenlabs | openai |
 *            gemini | other
 */
export const integrationErrorLogsTable = pgTable("integration_error_logs", {
  id: serial("id").primaryKey(),
  /** Null for platform-level errors that aren't tied to a specific vendor. */
  vendorId: integer("vendor_id").references(() => vendorsTable.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),         // e.g. "meta", "paystack"
  errorCode: text("error_code"),                // HTTP status or provider error code, e.g. "401", "INVALID_PUBLIC_KEY"
  errorMessage: text("error_message").notNull(),
  /** Extra context: request URL, response body excerpt, job name, etc. */
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type IntegrationErrorLog = typeof integrationErrorLogsTable.$inferSelect;
export type NewIntegrationErrorLog = typeof integrationErrorLogsTable.$inferInsert;
