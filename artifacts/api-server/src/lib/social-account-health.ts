/**
 * Periodic re-validation of OAuth-connected Facebook/Instagram accounts.
 *
 * Meta Page access tokens obtained through the OAuth connect flow
 * (social-oauth.ts) are long-lived (~60 days) but do expire, and a vendor
 * can also revoke access from their Facebook settings at any time. Until
 * now that failure only surfaced the next time someone clicked Publish.
 *
 * This mirrors the platform-gateway health recheck pattern
 * (platform-gateways.ts): re-test each stored credential on a timer, and
 * only act on the pass -> fail / fail -> pass *transition*, not every tick.
 * On a validated -> invalid transition the vendor gets a reconnect notice
 * (in-app + email) and admins get a Slack alert; the account's `status`
 * flips to "needs_reconnect" so publish flows (posts.ts, which only
 * targets status = "active") stop trying to use the dead token.
 */
import { eq, and, inArray } from "drizzle-orm";
import { db, socialAccountsTable, vendorsTable, vendorNotificationsTable } from "@workspace/db";
import { decrypt } from "./encryption";
import { validateMetaAccessToken } from "./meta";
import { sendSlackAlert } from "./slack";
import { sendEmail } from "./mailer";
import { wrapVendorEmail, escapeHtml } from "./email-branding";
import { logger } from "./logger";

// Only OAuth-connected Meta accounts have a real token that can expire or be
// revoked out-of-band; manual entries and other providers aren't in scope yet.
const META_PLATFORMS = ["Facebook", "Instagram"] as const;

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
        This usually happens when the connection expires or is revoked from your Facebook settings.
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

/** Re-validates a single OAuth-connected Meta social account and updates its status on a transition. */
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
    await validateMetaAccessToken(account.accountId, accessToken);

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
    return { accountId, checked: true, valid: true, becameInvalid: false, recovered };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const becameInvalid = wasActive;

    await db
      .update(socialAccountsTable)
      .set({
        status: "needs_reconnect",
        lastHealthCheckAt: new Date(),
        lastHealthCheckError: message,
        healthCheckFailingSince: account.healthCheckFailingSince ?? new Date(),
      })
      .where(eq(socialAccountsTable.id, account.id));

    if (becameInvalid) {
      await sendSlackAlert(
        `:rotating_light: *${account.platform}* account "${account.accountName}" (vendor ${account.vendorId}) stopped validating: ${message}\n` +
          `The vendor has been notified to reconnect it from the Social Hub.`,
      );
      await notifyVendorToReconnect(account.vendorId, account.platform, account.accountName, message);
    }

    return { accountId, checked: true, valid: false, becameInvalid, recovered: false, error: message };
  }
}

/** Rechecks every OAuth-connected Facebook/Instagram account. Used by the health scheduler and the admin "re-test now" action. */
export async function recheckAllSocialAccountsHealth(): Promise<SocialAccountRecheckResult[]> {
  const accounts = await db
    .select({ id: socialAccountsTable.id })
    .from(socialAccountsTable)
    .where(and(eq(socialAccountsTable.connectedVia, "oauth_meta"), inArray(socialAccountsTable.platform, [...META_PLATFORMS])));

  const results: SocialAccountRecheckResult[] = [];
  for (const { id } of accounts) {
    results.push(await recheckSocialAccount(id));
  }
  return results;
}
