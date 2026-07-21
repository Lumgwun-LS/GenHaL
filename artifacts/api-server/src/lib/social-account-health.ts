/**
 * Periodic re-validation of OAuth-connected Facebook/Instagram, LinkedIn, and
 * X (Twitter) accounts.
 *
 * Access tokens obtained through the OAuth connect flow (social-oauth.ts) are
 * all long- or medium-lived but do expire, and a vendor can also revoke
 * access from their platform settings at any time. Until now that failure
 * only surfaced the next time someone clicked Publish.
 *
 * This mirrors the platform-gateway health recheck pattern
 * (platform-gateways.ts): re-test each stored credential on a timer, and
 * only act on the pass -> fail / fail -> pass *transition*, not every tick.
 * On a validated -> invalid transition the vendor gets a reconnect notice
 * (in-app + email) and admins get a Slack alert; the account's `status`
 * flips to "needs_reconnect" so publish flows (posts.ts, which only
 * targets status = "active") stop trying to use the dead token.
 *
 * LinkedIn and X access tokens are shorter-lived than Meta's, so a failed
 * validation there is attempted once via the stored refresh token (the same
 * credential publish-time renewal in token-refresh.ts uses) before the
 * account is flagged — otherwise a routine hourly-check-vs-2h-token race
 * would falsely flag a perfectly healthy X connection as broken. This uses
 * the raw refresh calls directly (not token-refresh.ts's
 * `ensureFreshAccessToken`), which notifies on every failed renewal
 * regardless of transition — that's fine for a one-off publish-triggered
 * retry, but would spam Slack/email every hour here.
 */
import { eq, inArray, and, gte, count } from "drizzle-orm";
import { db, socialAccountsTable, vendorsTable, vendorNotificationsTable, socialAccountReconnectLogTable } from "@workspace/db";
import { decrypt, encrypt } from "./encryption";
import { validateMetaAccessToken } from "./meta";
import { fetchLinkedInProfile, refreshLinkedInAccessToken, isLinkedInAuthError } from "./linkedin";
import { fetchTwitterProfile, refreshTwitterAccessToken, isTwitterAuthError } from "./twitter";
import { sendSlackAlert } from "./slack";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { logger } from "./logger";

// The three OAuth-connected providers with a real token that can expire or
// be revoked out-of-band; manual entries aren't in scope.
const OAUTH_CONNECTED_VIA = ["oauth_meta", "oauth_linkedin", "oauth_twitter"] as const;

/**
 * Number of active → needs_reconnect transitions within the rolling 30-day
 * window that triggers the repeat-offender escalation Slack alert.
 * Fires only at the threshold crossing (exactly the Nth break), not on every
 * subsequent one.
 */
const REPEAT_OFFENDER_THRESHOLD = 3;

export interface SocialAccountRecheckResult {
  accountId: number;
  checked: boolean;
  valid: boolean;
  becameInvalid: boolean; // true only on the active -> needs_reconnect transition
  recovered: boolean; // true only on the needs_reconnect -> active transition
  error?: string;
}

async function notifyVendorToReconnect(
  vendorId: number,
  platform: string,
  accountName: string,
  reason: string,
): Promise<void> {
  const [vendor] = await db
    .select({ name: vendorsTable.name, email: vendorsTable.email })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendorId));
  if (!vendor) return;

  const message = `Your ${platform} account "${accountName}" is no longer connected — reconnect it from the Social Hub to keep publishing.`;

  await db.insert(vendorNotificationsTable).values({
    vendorId,
    type: "social_reconnect",
    message,
  });

  const html = wrapVendorEmail({
    bodyHtml: `
      <h1 style="text-align: center; font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">Reconnect your ${escapeHtml(platform)} account</h1>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        Hi ${escapeHtml(vendor.name)}, we could no longer verify access to your ${escapeHtml(platform)} account "${escapeHtml(accountName)}" (${escapeHtml(reason)}).
        This usually happens when the connection expires or is revoked from your ${escapeHtml(platform)} account settings.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #444;">
        Posts scheduled to this account will not publish until you reconnect it from the Social Hub.
      </p>`,
  });

  const result = await sendEmail({ to: vendor.email, subject: `Reconnect your ${platform} account`, html });
  if (result.status !== "sent") {
    logger.warn({ vendorId, platform, reason: result.error }, "[social-account-health] Reconnect email did not send");
  }
}

type SocialAccountRow = typeof socialAccountsTable.$inferSelect;

/** Runs the provider-appropriate cheap read-only API call to prove an access token is still live. Throws on failure. */
async function validateAccountAccessToken(account: SocialAccountRow, accessToken: string): Promise<void> {
  if (account.connectedVia === "oauth_linkedin") {
    await fetchLinkedInProfile(accessToken);
  } else if (account.connectedVia === "oauth_twitter") {
    await fetchTwitterProfile(accessToken);
  } else {
    await validateMetaAccessToken(account.accountId!, accessToken);
  }
}

/** Persists a passing check, healing the account if this job had previously flagged it. Returns whether it was a fail -> pass transition. */
async function markValid(account: SocialAccountRow): Promise<boolean> {
  await db
    .update(socialAccountsTable)
    .set({
      // Only auto-heal an account this job itself marked as needing
      // reconnection — never override a manual "active" the vendor set
      // some other way, and never resurrect a manually disconnected one.
      status: account.status === "needs_reconnect" ? "active" : account.status,
      lastHealthCheckAt: new Date(),
      lastHealthCheckError: null,
      healthCheckFailingSince: null,
    })
    .where(eq(socialAccountsTable.id, account.id));

  const recovered = account.status === "needs_reconnect";
  if (recovered) {
    await sendSlackAlert(
      `:white_check_mark: *${account.platform}* account "${account.accountName}" (vendor ${account.vendorId}) is reachable again after previously failing.`,
    );
  }
  return recovered;
}

/** Persists a failing check and, only on an active -> invalid transition, alerts admins and notifies the vendor to reconnect. */
async function markInvalid(account: SocialAccountRow, wasActive: boolean, message: string): Promise<void> {
  await db
    .update(socialAccountsTable)
    .set({
      status: "needs_reconnect",
      lastHealthCheckAt: new Date(),
      lastHealthCheckError: message,
      healthCheckFailingSince: account.healthCheckFailingSince ?? new Date(),
    })
    .where(eq(socialAccountsTable.id, account.id));

  if (wasActive) {
    // Record each active → needs_reconnect transition so the admin health tab
    // can surface accounts that keep flapping (broken, reconnected, broken again).
    await db.insert(socialAccountReconnectLogTable).values({ socialAccountId: account.id });

    // Count how many reconnect-log entries exist for this account in the last
    // 30 days (including the one we just inserted).
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [{ value: recentBreakCount }] = await db
      .select({ value: count() })
      .from(socialAccountReconnectLogTable)
      .where(
        and(
          eq(socialAccountReconnectLogTable.socialAccountId, account.id),
          gte(socialAccountReconnectLogTable.occurredAt, thirtyDaysAgo),
        ),
      );

    await sendSlackAlert(
      `:rotating_light: *${account.platform}* account "${account.accountName}" (vendor ${account.vendorId}) stopped validating: ${message}\n` +
        `The vendor has been notified to reconnect it from the Social Hub.`,
    );

    // Fire an escalation alert only at the threshold crossing — the Nth break,
    // not every subsequent one — so admins know this vendor needs direct follow-up.
    if (recentBreakCount === REPEAT_OFFENDER_THRESHOLD) {
      await sendSlackAlert(
        `:rotating_light::rotating_light: *Repeat offender – direct follow-up needed*\n` +
          `*${account.platform}* account "${account.accountName}" (vendor ${account.vendorId}) has broken ` +
          `*${recentBreakCount} times in the last 30 days*. The vendor may need direct support.`,
      );
    }

    await notifyVendorToReconnect(account.vendorId, account.platform, account.accountName, message);
  }
}

/**
 * For a LinkedIn/X account whose raw stored access token just failed to
 * validate with what looks like an auth error, attempts exactly one silent
 * renewal via the stored refresh token and persists the result. Returns true
 * if the renewal succeeded (the account is healthy again), false otherwise.
 */
async function tryRenewAndRevalidate(account: SocialAccountRow, validationError: string): Promise<boolean> {
  if (!account.refreshTokenEncrypted) return false;
  const isAuthError =
    account.connectedVia === "oauth_linkedin"
      ? isLinkedInAuthError(validationError)
      : account.connectedVia === "oauth_twitter"
        ? isTwitterAuthError(validationError)
        : false;
  if (!isAuthError) return false;

  try {
    const refreshToken = decrypt(account.refreshTokenEncrypted);
    const fresh =
      account.connectedVia === "oauth_linkedin" ? await refreshLinkedInAccessToken(refreshToken) : await refreshTwitterAccessToken(refreshToken);
    const tokenExpiresAt = fresh.expiresInSeconds ? new Date(Date.now() + fresh.expiresInSeconds * 1000) : account.tokenExpiresAt;
    await db
      .update(socialAccountsTable)
      .set({
        accessTokenEncrypted: encrypt(fresh.accessToken),
        ...(fresh.refreshToken ? { refreshTokenEncrypted: encrypt(fresh.refreshToken) } : {}),
        tokenExpiresAt,
      })
      .where(eq(socialAccountsTable.id, account.id));
    return true;
  } catch (err) {
    logger.warn(
      { accountId: account.id, platform: account.platform, error: err instanceof Error ? err.message : String(err) },
      "[social-account-health] Renewal attempt after a failed validation also failed",
    );
    return false;
  }
}

/** Re-validates a single OAuth-connected Meta/LinkedIn/X social account and updates its status on a transition. */
export async function recheckSocialAccount(accountId: number): Promise<SocialAccountRecheckResult> {
  const [account] = await db.select().from(socialAccountsTable).where(eq(socialAccountsTable.id, accountId));
  if (!account || !account.accessTokenEncrypted || !account.accountId) {
    return { accountId, checked: false, valid: false, becameInvalid: false, recovered: false };
  }

  const wasActive = account.status === "active";

  let accessToken: string;
  try {
    accessToken = decrypt(account.accessTokenEncrypted);
  } catch {
    accessToken = "";
  }

  try {
    await validateAccountAccessToken(account, accessToken);
    const recovered = await markValid(account);
    return { accountId, checked: true, valid: true, becameInvalid: false, recovered };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (await tryRenewAndRevalidate(account, message)) {
      const recovered = await markValid(account);
      return { accountId, checked: true, valid: true, becameInvalid: false, recovered };
    }

    const becameInvalid = wasActive;
    await markInvalid(account, wasActive, message);
    return { accountId, checked: true, valid: false, becameInvalid, recovered: false, error: message };
  }
}

/** Rechecks every OAuth-connected Facebook/Instagram/LinkedIn/X account. Used by the health scheduler and the admin "re-test now" action. */
export async function recheckAllSocialAccountsHealth(): Promise<SocialAccountRecheckResult[]> {
  const accounts = await db
    .select({ id: socialAccountsTable.id })
    .from(socialAccountsTable)
    .where(inArray(socialAccountsTable.connectedVia, [...OAUTH_CONNECTED_VIA]));

  const results: SocialAccountRecheckResult[] = [];
  for (const { id } of accounts) {
    results.push(await recheckSocialAccount(id));
  }
  return results;
}
