/**
 * Silent renewal of OAuth-connected social account tokens, so vendors don't
 * have to reconnect X (~2h access tokens), LinkedIn (~60 days), or Meta
 * (~60-day long-lived Page/IG tokens) every time one is about to expire.
 *
 * Each platform's `refreshTokenEncrypted` holds whatever credential renews
 * its `accessTokenEncrypted` (see social-accounts.ts schema comment):
 * X/LinkedIn store the OAuth refresh_token; Meta stores the long-lived
 * *user* token, which is re-exchanged and then used to re-derive a fresh
 * Page/IG access token via listManagedPages.
 *
 * Used two ways from posts.ts: proactively (before a publish attempt, if the
 * token is within REFRESH_MARGIN_MS of expiring) and reactively (forced,
 * after a publish attempt fails with an auth-looking error — the stored
 * expiry can be wrong/missing, or the platform can invalidate a token early).
 */
import { eq } from "drizzle-orm";
import { db, socialAccountsTable, vendorsTable, vendorNotificationsTable } from "@workspace/db";
import { encrypt, decrypt } from "./encryption";
import { refreshTwitterAccessToken } from "./twitter";
import { refreshLinkedInAccessToken } from "./linkedin";
import { refreshLongLivedUserToken, listManagedPages } from "./meta";
import { sendSlackAlert } from "./slack";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { logger } from "./logger";

type SocialAccount = typeof socialAccountsTable.$inferSelect;

// Refresh a bit before actual expiry so a publish attempt never races a token
// that's about to die mid-request.
const REFRESH_MARGIN_MS = 15 * 60 * 1000; // 15 minutes

export class ReconnectRequiredError extends Error {}

function tokenNeedsRefresh(account: SocialAccount, force: boolean): boolean {
  if (force) return true;
  if (!account.tokenExpiresAt) return false;
  return account.tokenExpiresAt.getTime() - Date.now() <= REFRESH_MARGIN_MS;
}

async function notifyVendorToReconnect(account: SocialAccount, reason: string): Promise<void> {
  const [vendor] = await db.select({ name: vendorsTable.name, email: vendorsTable.email }).from(vendorsTable).where(eq(vendorsTable.id, account.vendorId));
  if (!vendor) return;

  const message = `Your ${account.platform} account "${account.accountName}" needs to be reconnected — its connection could not be renewed automatically. Reconnect it from the Social Hub to keep publishing.`;
  await db.insert(vendorNotificationsTable).values({ vendorId: account.vendorId, type: "social_reconnect", message });

  const html = wrapVendorEmail({
    bodyHtml: `
      <h1 style="text-align: center; font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">Reconnect your ${escapeHtml(account.platform)} account</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        Hi ${escapeHtml(vendor.name)}, we tried to automatically renew your ${escapeHtml(account.platform)} connection "${escapeHtml(account.accountName)}" but it failed (${escapeHtml(reason)}).
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        Posts scheduled to this account will not publish until you reconnect it from the Social Hub.
      </p>`,
  });
  const result = await sendEmail({ to: vendor.email, subject: `Reconnect your ${account.platform} account`, html });
  if (result.status !== "sent") {
    logger.warn({ vendorId: account.vendorId, platform: account.platform, reason: result.error }, "[token-refresh] Reconnect email did not send");
  }
}

async function markNeedsReconnect(account: SocialAccount, reason: string): Promise<void> {
  await db
    .update(socialAccountsTable)
    .set({
      status: "needs_reconnect",
      lastHealthCheckAt: new Date(),
      lastHealthCheckError: reason,
      healthCheckFailingSince: account.healthCheckFailingSince ?? new Date(),
    })
    .where(eq(socialAccountsTable.id, account.id));
  await sendSlackAlert(
    `:rotating_light: *${account.platform}* account "${account.accountName}" (vendor ${account.vendorId}) could not be auto-renewed: ${reason}\n` +
      `The vendor has been notified to reconnect it from the Social Hub.`,
  );
  await notifyVendorToReconnect(account, reason);
}

/** Persists a freshly renewed token set and returns the plaintext access token. */
async function persistRefresh(
  account: SocialAccount,
  fresh: { accessToken: string; refreshToken: string | null; expiresInSeconds: number | null },
): Promise<string> {
  const tokenExpiresAt = fresh.expiresInSeconds ? new Date(Date.now() + fresh.expiresInSeconds * 1000) : account.tokenExpiresAt;
  await db
    .update(socialAccountsTable)
    .set({
      accessTokenEncrypted: encrypt(fresh.accessToken),
      ...(fresh.refreshToken ? { refreshTokenEncrypted: encrypt(fresh.refreshToken) } : {}),
      tokenExpiresAt,
      lastHealthCheckAt: new Date(),
      lastHealthCheckError: null,
      healthCheckFailingSince: null,
      // Clear any pending expiry warning so the vendor gets a fresh heads-up
      // the next time this token approaches expiry (e.g. after reconnecting).
      expiryWarningSentAt: null,
    })
    .where(eq(socialAccountsTable.id, account.id));
  return fresh.accessToken;
}

/**
 * Sends a one-time "your token is expiring soon and can't be auto-renewed"
 * in-app notification + email to the vendor. Called by tickExpiryWarnings in
 * token-refresh-scheduler.ts for accounts whose token is within EXPIRY_WARNING_DAYS
 * of expiry and have no refresh token stored.
 */
export async function notifyVendorExpiringSoon(account: SocialAccount): Promise<void> {
  const [vendor] = await db
    .select({ name: vendorsTable.name, email: vendorsTable.email })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, account.vendorId));
  if (!vendor) return;

  const daysLeft = account.tokenExpiresAt
    ? Math.max(0, Math.ceil((account.tokenExpiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;
  const daysLabel = daysLeft <= 1 ? "1 day" : `${daysLeft} days`;

  const message =
    `Your ${account.platform} account "${account.accountName}" connection will expire in ${daysLabel} ` +
    `and cannot be renewed automatically. Reconnect it from the Social Hub before it expires to avoid interrupted publishing.`;

  await db.insert(vendorNotificationsTable).values({
    vendorId: account.vendorId,
    type: "social_reconnect",
    message,
  });

  const html = wrapVendorEmail({
    bodyHtml: `
      <h1 style="text-align: center; font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">Your ${escapeHtml(account.platform)} connection is expiring soon</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        Hi ${escapeHtml(vendor.name)}, your ${escapeHtml(account.platform)} account "${escapeHtml(account.accountName)}" connection will expire in approximately <strong>${escapeHtml(daysLabel)}</strong>.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        This connection cannot be renewed automatically. To avoid any interruption to your scheduled posts, please reconnect it from the <strong>Social Hub</strong> before it expires.
      </p>`,
  });

  const result = await sendEmail({
    to: vendor.email,
    subject: `Action needed: reconnect your ${account.platform} account in ${daysLabel}`,
    html,
  });
  if (result.status !== "sent") {
    logger.warn(
      { vendorId: account.vendorId, platform: account.platform, reason: result.error },
      "[token-refresh] Expiry-warning email did not send",
    );
  }
}

/**
 * Renews a Meta Page/Instagram token: re-exchanges the stored long-lived user
 * token, then re-derives this specific Page's (or the Page behind this IG
 * account's) fresh access token from it via /me/accounts.
 */
async function refreshMetaAccount(account: SocialAccount): Promise<string> {
  if (!account.refreshTokenEncrypted || !account.accountId) {
    throw new ReconnectRequiredError(`No stored renewal credential for this ${account.platform} connection.`);
  }
  const currentUserToken = decrypt(account.refreshTokenEncrypted);
  const { accessToken: freshUserToken, expiresInSeconds } = await refreshLongLivedUserToken(currentUserToken);
  const pages = await listManagedPages(freshUserToken);

  const page =
    account.platform === "Instagram"
      ? pages.find((p) => p.instagramBusinessAccountId === account.accountId)
      : pages.find((p) => p.id === account.accountId);
  if (!page) {
    throw new ReconnectRequiredError(`Could not find "${account.accountName}" among this Meta user's Pages anymore.`);
  }

  const tokenExpiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : account.tokenExpiresAt;
  await db
    .update(socialAccountsTable)
    .set({
      accessTokenEncrypted: encrypt(page.accessToken),
      refreshTokenEncrypted: encrypt(freshUserToken),
      tokenExpiresAt,
      lastHealthCheckAt: new Date(),
      lastHealthCheckError: null,
      healthCheckFailingSince: null,
    })
    .where(eq(socialAccountsTable.id, account.id));
  return page.accessToken;
}

/**
 * Returns a valid, decrypted access token for this account — refreshing it
 * first if it's missing an expiry margin (or `force` is set, e.g. after a
 * publish attempt hit an auth error). Throws ReconnectRequiredError (and
 * flips the account to "needs_reconnect" + notifies the vendor) if renewal
 * isn't possible or fails.
 */
export async function ensureFreshAccessToken(account: SocialAccount, opts: { force?: boolean } = {}): Promise<string> {
  if (!account.accessTokenEncrypted) {
    throw new ReconnectRequiredError(`No connected ${account.platform} account with a live connection.`);
  }
  if (!tokenNeedsRefresh(account, opts.force ?? false)) {
    return decrypt(account.accessTokenEncrypted);
  }
  if (!account.refreshTokenEncrypted) {
    // Nothing to renew with — only surface this as a hard failure once the
    // token has actually (or is about to have) expired, not just because a
    // caller asked to force-check it.
    if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() - Date.now() <= REFRESH_MARGIN_MS) {
      await markNeedsReconnect(account, "Access token expired and no renewal credential is stored for this connection.");
      throw new ReconnectRequiredError(`Your ${account.platform} connection has expired. Reconnect it from the Social Hub.`);
    }
    return decrypt(account.accessTokenEncrypted);
  }

  try {
    if (account.connectedVia === "oauth_twitter") {
      const fresh = await refreshTwitterAccessToken(decrypt(account.refreshTokenEncrypted));
      return await persistRefresh(account, fresh);
    }
    if (account.connectedVia === "oauth_linkedin") {
      const fresh = await refreshLinkedInAccessToken(decrypt(account.refreshTokenEncrypted));
      return await persistRefresh(account, fresh);
    }
    if (account.connectedVia === "oauth_meta") {
      return await refreshMetaAccount(account);
    }
    // No renewal path for this connection type — fall back to whatever's stored.
    return decrypt(account.accessTokenEncrypted);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markNeedsReconnect(account, message);
    throw new ReconnectRequiredError(`Your ${account.platform} connection could not be renewed automatically (${message}). Reconnect it from the Social Hub.`);
  }
}
