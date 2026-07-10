/**
 * Twilio SMS sender — sends plain text messages via the Replit Connectors SDK.
 * Reuses the same account-SID discovery + auth pattern as voice-caller.ts.
 *
 *   TWILIO_PHONE_NUMBER  — Your Twilio "from" number in E.164 format (+12345678900)
 */
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger";

const E164_RE = /^\+[1-9]\d{1,14}$/;

let _connectors: ReplitConnectors | null = null;
function connectors(): ReplitConnectors {
  if (!_connectors) _connectors = new ReplitConnectors();
  return _connectors;
}

let _accountSid: string | null = null;
async function getAccountSid(): Promise<string> {
  if (_accountSid) return _accountSid;
  const res = await connectors().proxy("twilio", "/2010-04-01/Accounts.json");
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Twilio /Accounts.json returned ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { accounts: Array<{ sid: string }> };
  const sid = data.accounts?.[0]?.sid;
  if (!sid) throw new Error("Twilio /Accounts.json returned no accounts");
  _accountSid = sid;
  return sid;
}

export type SmsResult = {
  status: "sent" | "skipped" | "failed";
  messageSid?: string;
  error?: string;
};

export async function sendSms(opts: { to: string; body: string }): Promise<SmsResult> {
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!fromNumber) {
    logger.warn({ to: opts.to }, "[sms] TWILIO_PHONE_NUMBER not set — SMS skipped.");
    return { status: "skipped", error: "TWILIO_PHONE_NUMBER not configured" };
  }
  if (!E164_RE.test(opts.to)) {
    logger.warn({ to: opts.to }, "[sms] Invalid E.164 phone number — SMS skipped");
    return { status: "skipped", error: `Invalid phone number: ${opts.to}` };
  }

  try {
    const accountSid = await getAccountSid();
    const body = new URLSearchParams({ To: opts.to, From: fromNumber, Body: opts.body });

    const res = await connectors().proxy(
      "twilio",
      `/2010-04-01/Accounts/${accountSid}/Messages.json`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      throw new Error(`Twilio Messages API returned ${res.status}: ${errText}`);
    }

    const msg = (await res.json()) as { sid: string };
    logger.info({ messageSid: msg.sid, to: opts.to }, "[sms] SMS sent");
    return { status: "sent", messageSid: msg.sid };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, to: opts.to }, "[sms] SMS failed");
    return { status: "failed", error: message };
  }
}

/** True when TWILIO_PHONE_NUMBER is set (the connector itself handles auth). */
export function isSmsConfigured(): boolean {
  return Boolean(process.env.TWILIO_PHONE_NUMBER);
}
