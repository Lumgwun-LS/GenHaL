/**
 * Meta (Facebook Page + linked Instagram Business account) OAuth connection flow.
 *
 * GET /social/oauth/meta/start    — redirects the vendor to Facebook's OAuth dialog
 * GET /social/oauth/meta/callback — exchanges the code, stores each managed Page
 *                                   (and its linked Instagram account, if any) as a
 *                                   social_accounts row with an encrypted page token
 *
 * Mounted after requireAuth in routes/index.ts, so both routes already have a
 * verified Clerk session — the browser still carries the VendorHub session cookie
 * when Facebook redirects the top-level page back to our own domain.
 */
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import jwt from "jsonwebtoken";
import { db, vendorsTable, socialAccountsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  isMetaConfigured,
  buildMetaAuthUrl,
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  listManagedPages,
} from "../lib/meta";
import {
  isLinkedInConfigured,
  buildLinkedInAuthUrl,
  exchangeCodeForAccessToken as exchangeLinkedInCodeForAccessToken,
  fetchLinkedInProfile,
} from "../lib/linkedin";
import {
  isTwitterConfigured,
  buildTwitterAuthUrl,
  generatePkcePair,
  exchangeCodeForAccessToken as exchangeTwitterCodeForAccessToken,
  fetchTwitterProfile,
} from "../lib/twitter";
import { encrypt } from "../lib/encryption";

const router: IRouter = Router();

const STATE_TTL_SECONDS = 10 * 60;

function redirectUriFor(req: import("express").Request): string {
  const domain = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN || req.get("host");
  return `https://${domain}/api/social/oauth/meta/callback`;
}

function frontendSocialUrl(req: import("express").Request, query: string): string {
  const domain = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN || req.get("host");
  return `https://${domain}/social${query}`;
}

function linkedInRedirectUriFor(req: import("express").Request): string {
  const domain = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN || req.get("host");
  return `https://${domain}/api/social/oauth/linkedin/callback`;
}

function twitterRedirectUriFor(req: import("express").Request): string {
  const domain = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN || req.get("host");
  return `https://${domain}/api/social/oauth/twitter/callback`;
}

async function resolveVendorId(req: import("express").Request): Promise<number | null> {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return vendor?.id ?? null;
}

router.get("/social/oauth/meta/start", async (req, res): Promise<void> => {
  if (!isMetaConfigured()) {
    res.status(503).json({ error: "Facebook/Instagram connection is not configured. Ask an admin to add META_APP_ID and META_APP_SECRET." });
    return;
  }
  const vendorId = await resolveVendorId(req);
  if (!vendorId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const secret = process.env.SESSION_SECRET;
  if (!secret) { res.status(500).json({ error: "Server misconfiguration: SESSION_SECRET not set" }); return; }

  // The state is a signed, short-lived token binding this OAuth attempt to the
  // vendor who started it — Facebook echoes it back verbatim on the callback,
  // so we never have to trust a client-supplied vendorId there.
  const state = jwt.sign({ vendorId }, secret, { expiresIn: STATE_TTL_SECONDS });
  const authUrl = buildMetaAuthUrl(state, redirectUriFor(req));
  res.redirect(authUrl);
});

router.get("/social/oauth/meta/callback", async (req, res): Promise<void> => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const oauthError = typeof req.query.error_description === "string" ? req.query.error_description : null;

  if (oauthError) { res.redirect(frontendSocialUrl(req, `?social_connect=error&message=${encodeURIComponent(oauthError)}`)); return; }
  if (!code || !state) { res.redirect(frontendSocialUrl(req, "?social_connect=error&message=Missing%20code%20or%20state")); return; }

  const secret = process.env.SESSION_SECRET;
  if (!secret) { res.status(500).json({ error: "Server misconfiguration: SESSION_SECRET not set" }); return; }

  let statePayload: { vendorId: number };
  try {
    statePayload = jwt.verify(state, secret) as { vendorId: number };
  } catch {
    res.redirect(frontendSocialUrl(req, "?social_connect=error&message=Connection%20request%20expired%2C%20please%20try%20again"));
    return;
  }

  // The vendor who completes the callback must be the same one who started it —
  // the signed state proves that, independent of whatever the current session is.
  const currentVendorId = await resolveVendorId(req);
  if (!currentVendorId || currentVendorId !== statePayload.vendorId) {
    res.redirect(frontendSocialUrl(req, "?social_connect=error&message=Connection%20request%20does%20not%20match%20your%20account"));
    return;
  }

  try {
    const redirectUri = redirectUriFor(req);
    const shortLivedToken = await exchangeCodeForUserToken(code, redirectUri);
    const { accessToken: longLivedUserToken, expiresInSeconds } = await exchangeForLongLivedUserToken(shortLivedToken);
    const pages = await listManagedPages(longLivedUserToken);

    if (pages.length === 0) {
      res.redirect(frontendSocialUrl(req, "?social_connect=error&message=No%20Facebook%20Pages%20found%20for%20this%20account"));
      return;
    }

    const tokenExpiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null;
    let connectedCount = 0;

    for (const page of pages) {
      // Soft-reconnect: reuse the existing social_accounts row (matched by
      // vendor_id + platform + account_id) rather than inserting a new one.
      // This preserves the social_account_reconnect_log history across
      // token-expiry / revocation reconnect cycles, so the admin "N× in 30d"
      // repeat-offender badge accumulates correctly even when the vendor
      // reconnects multiple times.  (See lib/db/src/schema/social-account-reconnect-log.ts
      // for the trade-off that applies when a vendor explicitly deletes the row
      // before re-adding the same account.)
      const [existingFb] = await db
        .select({ id: socialAccountsTable.id })
        .from(socialAccountsTable)
        .where(and(eq(socialAccountsTable.vendorId, currentVendorId), eq(socialAccountsTable.platform, "Facebook"), eq(socialAccountsTable.accountId, page.id)));

      const fbValues = {
        vendorId: currentVendorId,
        platform: "Facebook",
        accountName: page.name,
        accountId: page.id,
        profileUrl: `https://www.facebook.com/${page.id}`,
        status: "active",
        connectedVia: "oauth_meta",
        accessTokenEncrypted: encrypt(page.accessToken),
        // Meta has no refresh_token grant — store the long-lived *user* token
        // here so it can be re-exchanged later to re-derive a fresh Page token
        // without the vendor redoing OAuth (see lib/token-refresh.ts).
        refreshTokenEncrypted: encrypt(longLivedUserToken),
        tokenExpiresAt,
        // Reset expiry-warning sentinel so the vendor gets a fresh heads-up
        // the next time this token approaches expiry after reconnecting.
        expiryWarningSentAt: null,
      };
      if (existingFb) {
        await db.update(socialAccountsTable).set(fbValues).where(eq(socialAccountsTable.id, existingFb.id));
      } else {
        await db.insert(socialAccountsTable).values(fbValues);
      }
      connectedCount += 1;

      if (page.instagramBusinessAccountId) {
        const [existingIg] = await db
          .select({ id: socialAccountsTable.id })
          .from(socialAccountsTable)
          .where(and(eq(socialAccountsTable.vendorId, currentVendorId), eq(socialAccountsTable.platform, "Instagram"), eq(socialAccountsTable.accountId, page.instagramBusinessAccountId)));

        const igValues = {
          vendorId: currentVendorId,
          platform: "Instagram",
          accountName: page.instagramUsername ?? page.name,
          accountId: page.instagramBusinessAccountId,
          profileUrl: page.instagramUsername ? `https://www.instagram.com/${page.instagramUsername}` : null,
          status: "active",
          connectedVia: "oauth_meta",
          // Publishing to an Instagram Business account uses the linked Page's
          // access token, not a separate Instagram-specific one.
          accessTokenEncrypted: encrypt(page.accessToken),
          refreshTokenEncrypted: encrypt(longLivedUserToken),
          tokenExpiresAt,
          // Reset expiry-warning sentinel on reconnect.
          expiryWarningSentAt: null,
        };
        if (existingIg) {
          await db.update(socialAccountsTable).set(igValues).where(eq(socialAccountsTable.id, existingIg.id));
        } else {
          await db.insert(socialAccountsTable).values(igValues);
        }
        connectedCount += 1;
      }
    }

    res.redirect(frontendSocialUrl(req, `?social_connect=success&count=${connectedCount}`));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect Facebook account";
    res.redirect(frontendSocialUrl(req, `?social_connect=error&message=${encodeURIComponent(message)}`));
  }
});

router.get("/social/oauth/linkedin/start", async (req, res): Promise<void> => {
  if (!isLinkedInConfigured()) {
    res.status(503).json({ error: "LinkedIn connection is not configured. Ask an admin to add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET." });
    return;
  }
  const vendorId = await resolveVendorId(req);
  if (!vendorId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const secret = process.env.SESSION_SECRET;
  if (!secret) { res.status(500).json({ error: "Server misconfiguration: SESSION_SECRET not set" }); return; }

  const state = jwt.sign({ vendorId }, secret, { expiresIn: STATE_TTL_SECONDS });
  const authUrl = buildLinkedInAuthUrl(state, linkedInRedirectUriFor(req));
  res.redirect(authUrl);
});

router.get("/social/oauth/linkedin/callback", async (req, res): Promise<void> => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const oauthError = typeof req.query.error_description === "string" ? req.query.error_description : null;

  if (oauthError) { res.redirect(frontendSocialUrl(req, `?social_connect=error&message=${encodeURIComponent(oauthError)}`)); return; }
  if (!code || !state) { res.redirect(frontendSocialUrl(req, "?social_connect=error&message=Missing%20code%20or%20state")); return; }

  const secret = process.env.SESSION_SECRET;
  if (!secret) { res.status(500).json({ error: "Server misconfiguration: SESSION_SECRET not set" }); return; }

  let statePayload: { vendorId: number };
  try {
    statePayload = jwt.verify(state, secret) as { vendorId: number };
  } catch {
    res.redirect(frontendSocialUrl(req, "?social_connect=error&message=Connection%20request%20expired%2C%20please%20try%20again"));
    return;
  }

  const currentVendorId = await resolveVendorId(req);
  if (!currentVendorId || currentVendorId !== statePayload.vendorId) {
    res.redirect(frontendSocialUrl(req, "?social_connect=error&message=Connection%20request%20does%20not%20match%20your%20account"));
    return;
  }

  try {
    const redirectUri = linkedInRedirectUriFor(req);
    const { accessToken, refreshToken, expiresInSeconds } = await exchangeLinkedInCodeForAccessToken(code, redirectUri);
    const profile = await fetchLinkedInProfile(accessToken);
    const tokenExpiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null;

    // Soft-reconnect: reuse the existing row rather than inserting so that
    // social_account_reconnect_log history survives routine token-expiry reconnects.
    const [existing] = await db
      .select({ id: socialAccountsTable.id })
      .from(socialAccountsTable)
      .where(and(eq(socialAccountsTable.vendorId, currentVendorId), eq(socialAccountsTable.platform, "LinkedIn"), eq(socialAccountsTable.accountId, profile.memberId)));

    const values = {
      vendorId: currentVendorId,
      platform: "LinkedIn",
      accountName: profile.name,
      accountId: profile.memberId,
      profileUrl: null,
      status: "active",
      connectedVia: "oauth_linkedin",
      accessTokenEncrypted: encrypt(accessToken),
      // Only present for apps with LinkedIn's "Programmatic refresh tokens"
      // product — without it this stays null and the ~60-day token can't be
      // silently renewed; the vendor gets a reconnect notice once it expires.
      refreshTokenEncrypted: refreshToken ? encrypt(refreshToken) : null,
      tokenExpiresAt,
      // Reset expiry-warning sentinel so the vendor gets a fresh heads-up
      // the next time this (new) token approaches expiry after reconnecting.
      expiryWarningSentAt: null,
    };
    if (existing) {
      await db.update(socialAccountsTable).set(values).where(eq(socialAccountsTable.id, existing.id));
    } else {
      await db.insert(socialAccountsTable).values(values);
    }

    res.redirect(frontendSocialUrl(req, "?social_connect=success&count=1&provider=linkedin"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect LinkedIn account";
    res.redirect(frontendSocialUrl(req, `?social_connect=error&message=${encodeURIComponent(message)}`));
  }
});

router.get("/social/oauth/twitter/start", async (req, res): Promise<void> => {
  if (!isTwitterConfigured()) {
    res.status(503).json({ error: "X/Twitter connection is not configured. Ask an admin to add X_CLIENT_ID and X_CLIENT_SECRET." });
    return;
  }
  const vendorId = await resolveVendorId(req);
  if (!vendorId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const secret = process.env.SESSION_SECRET;
  if (!secret) { res.status(500).json({ error: "Server misconfiguration: SESSION_SECRET not set" }); return; }

  // X's PKCE flow needs the code_verifier again at the callback, but the
  // callback is a separate request/redirect — we embed it in the signed state
  // JWT alongside vendorId rather than stashing it server-side, so it survives
  // without needing sticky sessions.
  const { codeVerifier, codeChallenge } = generatePkcePair();
  const state = jwt.sign({ vendorId, codeVerifier }, secret, { expiresIn: STATE_TTL_SECONDS });
  const authUrl = buildTwitterAuthUrl(state, twitterRedirectUriFor(req), codeChallenge);
  res.redirect(authUrl);
});

router.get("/social/oauth/twitter/callback", async (req, res): Promise<void> => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const oauthError = typeof req.query.error_description === "string" ? req.query.error_description : null;

  if (oauthError) { res.redirect(frontendSocialUrl(req, `?social_connect=error&message=${encodeURIComponent(oauthError)}`)); return; }
  if (!code || !state) { res.redirect(frontendSocialUrl(req, "?social_connect=error&message=Missing%20code%20or%20state")); return; }

  const secret = process.env.SESSION_SECRET;
  if (!secret) { res.status(500).json({ error: "Server misconfiguration: SESSION_SECRET not set" }); return; }

  let statePayload: { vendorId: number; codeVerifier: string };
  try {
    statePayload = jwt.verify(state, secret) as { vendorId: number; codeVerifier: string };
  } catch {
    res.redirect(frontendSocialUrl(req, "?social_connect=error&message=Connection%20request%20expired%2C%20please%20try%20again"));
    return;
  }

  const currentVendorId = await resolveVendorId(req);
  if (!currentVendorId || currentVendorId !== statePayload.vendorId) {
    res.redirect(frontendSocialUrl(req, "?social_connect=error&message=Connection%20request%20does%20not%20match%20your%20account"));
    return;
  }

  try {
    const redirectUri = twitterRedirectUriFor(req);
    const { accessToken, refreshToken, expiresInSeconds } = await exchangeTwitterCodeForAccessToken(code, redirectUri, statePayload.codeVerifier);
    const profile = await fetchTwitterProfile(accessToken);
    const tokenExpiresAt = expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null;

    // Soft-reconnect: reuse the existing row rather than inserting so that
    // social_account_reconnect_log history survives routine token-expiry reconnects.
    const [existing] = await db
      .select({ id: socialAccountsTable.id })
      .from(socialAccountsTable)
      .where(and(eq(socialAccountsTable.vendorId, currentVendorId), eq(socialAccountsTable.platform, "X (Twitter)"), eq(socialAccountsTable.accountId, profile.userId)));

    const values = {
      vendorId: currentVendorId,
      platform: "X (Twitter)",
      accountName: `@${profile.username}`,
      accountId: profile.userId,
      profileUrl: `https://twitter.com/${profile.username}`,
      status: "active",
      connectedVia: "oauth_twitter",
      accessTokenEncrypted: encrypt(accessToken),
      // Requesting "offline.access" (see twitter.ts) gets us a refresh token,
      // used to silently renew the ~2h access token (see lib/token-refresh.ts)
      // instead of the vendor having to reconnect constantly.
      refreshTokenEncrypted: refreshToken ? encrypt(refreshToken) : null,
      tokenExpiresAt,
      // Reset expiry-warning sentinel so the vendor gets a fresh heads-up
      // the next time this (new) token approaches expiry after reconnecting.
      expiryWarningSentAt: null,
    };
    if (existing) {
      await db.update(socialAccountsTable).set(values).where(eq(socialAccountsTable.id, existing.id));
    } else {
      await db.insert(socialAccountsTable).values(values);
    }

    res.redirect(frontendSocialUrl(req, "?social_connect=success&count=1&provider=twitter"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect X account";
    res.redirect(frontendSocialUrl(req, `?social_connect=error&message=${encodeURIComponent(message)}`));
  }
});

export default router;
