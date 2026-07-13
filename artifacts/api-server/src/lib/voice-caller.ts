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
import { registerAudio, synthesizeSpeech } from "./elevenlabs-voice";

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

function escapeXml(message: string): string {
  return message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSayTwiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna" language="en-US">${escapeXml(message)}</Say><Pause length="1"/></Response>`;
}

/**
 * Builds TwiML for the call. Synthesizes the message via ElevenLabs UP FRONT
 * (before the Twilio call is placed) and points TwiML at our own
 * /api/voice/tts-audio/:token endpoint to serve that pre-made audio — so
 * there's no synthesis latency mid-call and Twilio never has to hit a URL
 * that isn't ready yet.
 *
 * Falls back to Twilio's built-in <Say> voice when no public domain is
 * configured, or when ElevenLabs synthesis fails for any reason — a robotic
 * voice beats a silent/failed call.
 */
async function buildTwiml(message: string): Promise<string> {
  const domain = getPublicDomain();
  if (!domain) {
    logger.warn(
      "[voice] No public domain configured — falling back to Twilio's built-in voice for this call",
    );
    return buildSayTwiml(message);
  }

  try {
    const audio = await synthesizeSpeech(message);
    const token = registerAudio(audio);
    const audioUrl = `https://${domain}/api/voice/tts-audio/${token}`;
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${escapeXml(audioUrl)}</Play><Pause length="1"/></Response>`;
  } catch (err) {
    logger.warn(
      { err },
      "[voice] ElevenLabs synthesis failed — falling back to Twilio's built-in voice for this call",
    );
    return buildSayTwiml(message);
  }
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
      Twiml:  await buildTwiml(opts.message),
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

export type TwilioCallSnapshot = {
  status: string;
  durationSeconds?: number;
};

/**
 * Fetches a call's current status straight from Twilio's REST API (not the
 * status-callback webhook). Used by the backfill/reconciliation job to
 * recover calls whose status-callback POSTs were rejected while
 * TWILIO_AUTH_TOKEN was stale — this path goes through the Replit connector
 * (outbound, API-key based) rather than webhook signature validation, so it
 * still works even during the window the callback was failing.
 */
export async function fetchCallStatus(callSid: string): Promise<TwilioCallSnapshot | null> {
  const accountSid = await getAccountSid();
  const res = await connectors().proxy(
    "twilio",
    `/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Twilio Calls/${callSid}.json returned ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { status: string; duration?: string | null };
  return {
    status: data.status,
    durationSeconds:
      typeof data.duration === "string" && data.duration.trim() !== "" && !Number.isNaN(Number(data.duration))
        ? Number(data.duration)
        : undefined,
  };
}
