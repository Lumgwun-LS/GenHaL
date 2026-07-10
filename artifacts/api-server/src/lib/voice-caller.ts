/**
 * Twilio voice caller — places outbound calls via the Replit Connectors SDK.
 *
 * Authentication (Account SID + Auth Token) is handled automatically by the
 * Replit Twilio integration.  The only env var you need to set manually is:
 *
 *   TWILIO_PHONE_NUMBER  — Your Twilio "from" number in E.164 format (+12345678900)
 *
 * The account SID is discovered on the first call and cached in memory.
 */
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger";

const E164_RE = /^\+[1-9]\d{1,14}$/;

let _connectors: ReplitConnectors | null = null;
function connectors(): ReplitConnectors {
  if (!_connectors) _connectors = new ReplitConnectors();
  return _connectors;
}

// Cache the account SID so we only fetch it once per process
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

/**
 * Public base URL Twilio can reach to deliver status callbacks.
 * In dev, Replit exposes the workspace at REPLIT_DEV_DOMAIN. In production,
 * set PUBLIC_APP_DOMAIN to the deployed domain (e.g. api.example.com).
 */
function getPublicDomain(): string | null {
  return process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN || null;
}

function getStatusCallbackUrl(): string | null {
  const domain = getPublicDomain();
  if (!domain) return null;
  return `https://${domain}/api/voice/status-callback`;
}

function buildTwiml(message: string): string {
  const safe = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna" language="en-US">${safe}</Say><Pause length="1"/></Response>`;
}

export type CallResult = {
  status: "placed" | "skipped" | "failed";
  callSid?: string;
  error?: string;
};

export async function placeCall(opts: {
  to: string;
  message: string;
  purpose: string;
  vendorId?: number;
  campaignId?: number;
}): Promise<CallResult> {
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!fromNumber) {
    logger.warn(
      { purpose: opts.purpose, to: opts.to },
      "[voice] TWILIO_PHONE_NUMBER not set — call skipped. Add it to your Replit Secrets.",
    );
    return { status: "skipped", error: "TWILIO_PHONE_NUMBER not configured" };
  }

  if (!E164_RE.test(opts.to)) {
    logger.warn({ to: opts.to }, "[voice] Invalid E.164 phone number — call skipped");
    return { status: "skipped", error: `Invalid phone number: ${opts.to}` };
  }

  try {
    const accountSid = await getAccountSid();

    const body = new URLSearchParams({
      To:     opts.to,
      From:   fromNumber,
      Twiml:  buildTwiml(opts.message),
    });

    const statusCallbackUrl = getStatusCallbackUrl();
    if (statusCallbackUrl) {
      body.set("StatusCallback", statusCallbackUrl);
      body.set("StatusCallbackMethod", "POST");
      body.set("StatusCallbackEvent", "completed");
    } else {
      logger.warn(
        "[voice] No public domain configured (PUBLIC_APP_DOMAIN/REPLIT_DEV_DOMAIN) — status callback not set, call status won't update after completion",
      );
    }

    const res = await connectors().proxy(
      "twilio",
      `/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      throw new Error(`Twilio Calls API returned ${res.status}: ${errText}`);
    }

    const call = (await res.json()) as { sid: string };
    logger.info({ callSid: call.sid, to: opts.to, purpose: opts.purpose }, "[voice] Call placed");
    return { status: "placed", callSid: call.sid };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, to: opts.to, purpose: opts.purpose }, "[voice] Call failed");
    return { status: "failed", error: msg };
  }
}

/**
 * True when the Replit Twilio integration is attached and TWILIO_PHONE_NUMBER is set.
 * The integration itself handles account SID + auth token automatically.
 */
export function isTwilioConfigured(): boolean {
  // Check TWILIO_PHONE_NUMBER is present. The Replit connector handles auth.
  return Boolean(process.env.TWILIO_PHONE_NUMBER);
}
