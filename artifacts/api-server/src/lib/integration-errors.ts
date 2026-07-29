/**
 * Integration Error Logger
 *
 * Call `logIntegrationError()` at every point where the server makes a
 * request to an external platform and receives a failure. It inserts a row
 * into integration_error_logs and never throws — the originating call must
 * not be disrupted by a logging failure.
 *
 * Recognised platforms:
 *   meta | linkedin | x_twitter | paystack | stripe | paypal |
 *   flutterwave | nomba | remita | twilio | elevenlabs | openai | gemini | other
 */

import { db, integrationErrorLogsTable } from "@workspace/db";
import pino from "pino";

const logger = pino({ name: "integration-errors" });

export interface IntegrationErrorParams {
  vendorId?: number | null;
  platform: string;
  errorCode?: string | null;
  errorMessage: string;
  /** Any additional context — request URL, partial response, job name, etc. */
  metadata?: Record<string, unknown> | null;
}

/**
 * Fire-and-forget: logs an external API failure to the DB.
 * Returns the new row's id (or null if the insert failed).
 */
export async function logIntegrationError(params: IntegrationErrorParams): Promise<number | null> {
  try {
    const [row] = await db
      .insert(integrationErrorLogsTable)
      .values({
        vendorId: params.vendorId ?? null,
        platform: params.platform,
        errorCode: params.errorCode ?? null,
        errorMessage: params.errorMessage,
        metadata: params.metadata ?? null,
      })
      .returning({ id: integrationErrorLogsTable.id });
    return row?.id ?? null;
  } catch (err) {
    logger.error({ err, params }, "logIntegrationError: failed to write to DB");
    return null;
  }
}

/** Human-readable label for a platform slug. */
export const PLATFORM_LABELS: Record<string, string> = {
  meta:        "Meta (Facebook / Instagram)",
  linkedin:    "LinkedIn",
  x_twitter:   "X / Twitter",
  paystack:    "Paystack",
  stripe:      "Stripe",
  paypal:      "PayPal",
  flutterwave: "Flutterwave",
  nomba:       "Nomba",
  remita:      "Remita",
  twilio:      "Twilio (Voice / SMS)",
  elevenlabs:  "ElevenLabs (AI Voice)",
  openai:      "OpenAI (AI)",
  gemini:      "Gemini (AI)",
  other:       "Other / Unknown",
};

export const KNOWN_PLATFORMS = Object.keys(PLATFORM_LABELS);
