/**
 * Expo push notification helper.
 * Sends notifications through Expo's push service (no API key required for
 * Expo push tokens — Expo brokers delivery to APNs/FCM on our behalf).
 *
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */
import { db, vendorPushTokensTable, vendorsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const EXPO_PUSH_API = "https://exp.host/--/api/v2/push/send";

/**
 * Push notification categories a vendor can individually mute from the
 * mobile Account tab. Each maps to a boolean column on vendorsTable that
 * defaults to true, so adding a new category never silently changes
 * existing behavior for vendors who haven't touched the setting.
 */
export type PushCategory = "payments" | "voice_campaigns" | "post_reminders" | "ai_media_expiry";

const PUSH_CATEGORY_COLUMN = {
  payments: vendorsTable.pushPaymentAlertsEnabled,
  voice_campaigns: vendorsTable.pushVoiceCampaignAlertsEnabled,
  post_reminders: vendorsTable.pushPostRemindersEnabled,
  ai_media_expiry: vendorsTable.pushAiMediaExpiryEnabled,
} as const;

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Sends a batch of push messages via Expo's push API. Never throws — logs and swallows errors. */
async function sendExpoPushMessages(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  try {
    const res = await fetch(EXPO_PUSH_API, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const body = (await res.json().catch(() => null)) as
      | { data?: Array<{ status: string; message?: string; details?: { error?: string } }> }
      | null;
    if (!res.ok) {
      console.error("[push] Expo push API request failed:", res.status, body);
      return;
    }

    // Each ticket can independently report an error (e.g. DeviceNotRegistered).
    const tickets = body?.data ?? [];
    for (const [i, ticket] of tickets.entries()) {
      if (ticket.status === "error") {
        console.warn(`[push] ticket error for token=${messages[i]?.to}:`, ticket.message, ticket.details);
        if (ticket.details?.error === "DeviceNotRegistered") {
          await db
            .delete(vendorPushTokensTable)
            .where(eq(vendorPushTokensTable.expoPushToken, messages[i].to))
            .catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error("[push] Failed to send Expo push messages:", err);
  }
}

/**
 * Sends a push notification to every device a vendor has registered.
 * When `category` is given, the vendor's per-category preference is
 * checked first and the send is skipped entirely if they've muted it.
 * Omitting `category` sends unconditionally (used for uncategorized/
 * account-level pushes, if any).
 */
export async function sendPushToVendor(
  vendorId: number,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  category?: PushCategory,
): Promise<void> {
  if (category) {
    const column = PUSH_CATEGORY_COLUMN[category];
    const [vendor] = await db
      .select({ enabled: column })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, vendorId))
      .limit(1);
    // Default to sending if the vendor row can't be found — that's an
    // unexpected state, not an explicit opt-out.
    if (vendor && vendor.enabled === false) return;
  }

  const tokens = await db
    .select({ expoPushToken: vendorPushTokensTable.expoPushToken })
    .from(vendorPushTokensTable)
    .where(eq(vendorPushTokensTable.vendorId, vendorId));

  if (tokens.length === 0) return;

  await sendExpoPushMessages(
    tokens.map((t) => ({ to: t.expoPushToken, title, body, data })),
  );
}

const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>();

function formatCurrency(amount: string | number, currency: string): string {
  let formatter = CURRENCY_FORMATTERS.get(currency);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 });
    } catch {
      formatter = undefined;
    }
    if (formatter) CURRENCY_FORMATTERS.set(currency, formatter);
  }
  const numeric = typeof amount === "string" ? Number(amount) : amount;
  return formatter ? formatter.format(numeric) : `${currency} ${numeric.toFixed(2)}`;
}

/**
 * Sends a push notification to every admin who has a vendor account with a
 * registered push token. Admin Clerk user IDs are read from ADMIN_USER_IDS.
 * Never throws — errors are logged and swallowed (same contract as sendPushToVendor).
 */
export async function sendPushToAdmins(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const adminClerkIds = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminClerkIds.length === 0) return;

  try {
    const adminVendors = await db
      .select({ id: vendorsTable.id })
      .from(vendorsTable)
      .where(inArray(vendorsTable.clerkUserId, adminClerkIds));

    await Promise.all(
      adminVendors.map((v) => sendPushToVendor(v.id, title, body, data)),
    );
  } catch (err) {
    console.error("[push] sendPushToAdmins failed:", err);
  }
}

/** Notifies a vendor that one of their payments changed status (paid/failed/refunded). */
export async function notifyVendorPaymentStatus(
  vendorId: number,
  status: "paid" | "failed" | "refunded",
  amount: string | number,
  currency: string,
): Promise<void> {
  const formatted = formatCurrency(amount, currency);
  const copy: Record<typeof status, { title: string; body: string }> = {
    paid:     { title: "Payment received", body: `A payment of ${formatted} just cleared.` },
    failed:   { title: "Payment failed", body: `A payment of ${formatted} did not go through.` },
    refunded: { title: "Payment refunded", body: `A payment of ${formatted} was refunded.` },
  };

  await sendPushToVendor(vendorId, copy[status].title, copy[status].body, {
    screen: "payments",
  }, "payments");
}
