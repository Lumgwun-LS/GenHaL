/**
 * Twilio voice caller — places outbound calls with inline TwiML.
 *
 * Credentials are read from environment variables:
 *   TWILIO_ACCOUNT_SID   — Account SID from Twilio Console (or Replit integration)
 *   TWILIO_AUTH_TOKEN    — Auth token from Twilio Console (or Replit integration)
 *   TWILIO_PHONE_NUMBER  — Your Twilio "from" phone number in E.164 format (+12345678900)
 *
 * When credentials are not set the module logs a warning and returns a
 * "skipped" result — the rest of the app stays functional.
 */
import { logger } from "./logger";

const E164_RE = /^\+[1-9]\d{1,14}$/;

export type CallResult = {
  status: "placed" | "skipped" | "failed";
  callSid?: string;
  error?: string;
};

function buildTwiml(message: string): string {
  // Polly.Joanna is a natural-sounding Amazon Polly voice available on Twilio
  const safe = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna" language="en-US">${safe}</Say><Pause length="1"/></Response>`;
}

export async function placeCall(opts: {
  to: string;
  message: string;
  purpose: string;
  vendorId?: number;
  campaignId?: number;
}): Promise<CallResult> {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    logger.warn(
      { purpose: opts.purpose, to: opts.to },
      "[voice] Twilio credentials not configured — call skipped. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER.",
    );
    return { status: "skipped", error: "Twilio not configured" };
  }

  if (!E164_RE.test(opts.to)) {
    logger.warn({ to: opts.to }, "[voice] Invalid E.164 phone number — call skipped");
    return { status: "skipped", error: `Invalid phone number: ${opts.to}` };
  }

  try {
    // Dynamic require so the module loads even when twilio is not installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Twilio = (await import("twilio")).default;
    const client = Twilio(sid, token);

    const call = await client.calls.create({
      twiml: buildTwiml(opts.message),
      to: opts.to,
      from,
    });

    logger.info(
      { callSid: call.sid, to: opts.to, purpose: opts.purpose },
      "[voice] Call placed",
    );
    return { status: "placed", callSid: call.sid };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, to: opts.to, purpose: opts.purpose }, "[voice] Call failed");
    return { status: "failed", error: msg };
  }
}

/** True if Twilio credentials are available in the environment. */
export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN  &&
    process.env.TWILIO_PHONE_NUMBER,
  );
}
