/**
 * OAuth 2.0 Authorization Server — authorization code flow.
 *
 * Allows third-party apps (Zapier, HubSpot, Make, CRMs, AI platforms, etc.)
 * to request delegated access to a vendor's Awa Biz Suite data.
 *
 * Flow:
 *   1. Third-party redirects user to  GET /oauth/authorize?client_id=...&redirect_uri=...&scope=...&state=...
 *   2. User (vendor) sees the consent screen on the frontend (/oauth/authorize page)
 *   3. Frontend calls               POST /api/oauth/authorize  { clientId, approved, scopes, redirectUri, state }
 *   4. On approval — authorization code issued, vendor redirected to redirect_uri?code=...&state=...
 *   5. Third-party backend calls    POST /api/oauth/token  { grant_type, code, client_id, client_secret, redirect_uri }
 *   6. Access token returned — used as "Bearer <token>" on /api/external/* routes
 *
 * Public endpoints (no Clerk auth):
 *   GET  /oauth/client-info          — client details for consent screen
 *   POST /oauth/token                — exchange code for access token
 *   POST /oauth/revoke               — revoke an access token
 *   GET  /.well-known/oauth-authorization-server — RFC 8414 discovery
 *
 * Clerk-authenticated:
 *   POST /oauth/authorize            — vendor approves/denies
 */

import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { getAuth } from "@clerk/express";
import { db, vendorsTable, oauthClientsTable, oauthTokensTable } from "@workspace/db";
import { eq, and, isNull, gt } from "drizzle-orm";

const router = Router();

function sha256(raw: string) { return createHash("sha256").update(raw).digest("hex"); }

const CODE_TTL_MS   = 10 * 60 * 1000;  // 10 minutes
const TOKEN_TTL_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Discovery ─────────────────────────────────────────────────────────────────

router.get("/.well-known/oauth-authorization-server", (_req, res): void => {
  const base = process.env.API_BASE_URL ?? "https://awajimaaapp.io";
  res.json({
    issuer:                 base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint:         `${base}/api/oauth/token`,
    revocation_endpoint:    `${base}/api/oauth/revoke`,
    scopes_supported:       ["read", "write:posts", "write:leads", "write:products", "write:orders", "write:inventory", "write:campaigns", "analytics"],
    response_types_supported: ["code"],
    grant_types_supported:  ["authorization_code"],
    code_challenge_methods_supported: [],
    token_endpoint_auth_methods_supported: ["client_secret_post"],
  });
});

// ── Client info (public — used by consent screen) ─────────────────────────────

router.get("/oauth/client-info", async (req, res): Promise<void> => {
  const { client_id, redirect_uri, scope, state } = req.query as Record<string, string>;
  if (!client_id) { res.status(400).json({ error: "client_id is required" }); return; }

  const [client] = await db.select({
    clientId:    oauthClientsTable.clientId,
    name:        oauthClientsTable.name,
    description: oauthClientsTable.description,
    websiteUrl:  oauthClientsTable.websiteUrl,
    logoUrl:     oauthClientsTable.logoUrl,
    scopes:      oauthClientsTable.scopes,
    redirectUris: oauthClientsTable.redirectUris,
    isActive:    oauthClientsTable.isActive,
  }).from(oauthClientsTable).where(eq(oauthClientsTable.clientId, client_id)).limit(1);

  if (!client || !client.isActive) {
    res.status(404).json({ error: "OAuth client not found or inactive" });
    return;
  }

  // Validate redirect URI
  if (redirect_uri && !client.redirectUris.includes(redirect_uri)) {
    res.status(400).json({ error: "redirect_uri not registered for this client" });
    return;
  }

  // Parse and validate requested scopes
  const requestedScopes = scope ? scope.split(" ").filter(Boolean) : client.scopes;
  const validScopes = requestedScopes.filter((s) => client.scopes.includes(s));

  res.json({
    clientId:        client.clientId,
    name:            client.name,
    description:     client.description,
    websiteUrl:      client.websiteUrl,
    logoUrl:         client.logoUrl,
    requestedScopes: validScopes,
    redirectUri:     redirect_uri ?? client.redirectUris[0],
    state:           state ?? "",
  });
});

// ── Vendor approves/denies authorization (Clerk-authenticated) ─────────────────

router.post("/oauth/authorize", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Sign in required" }); return; }

  const { clientId, approved, scopes, redirectUri, state } = req.body as {
    clientId?: string; approved?: boolean; scopes?: string[];
    redirectUri?: string; state?: string;
  };

  if (!clientId || !redirectUri) {
    res.status(400).json({ error: "clientId and redirectUri are required" }); return;
  }

  // Look up client
  const [client] = await db.select().from(oauthClientsTable)
    .where(and(eq(oauthClientsTable.clientId, clientId), eq(oauthClientsTable.isActive, true))).limit(1);
  if (!client) { res.status(404).json({ error: "OAuth client not found" }); return; }
  if (!client.redirectUris.includes(redirectUri)) {
    res.status(400).json({ error: "redirect_uri not registered" }); return;
  }

  // Denial — redirect with error
  if (!approved) {
    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    res.json({ redirectUrl: url.toString() });
    return;
  }

  // Find vendor
  const [vendor] = await db.select({ id: vendorsTable.id })
    .from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId)).limit(1);
  if (!vendor) { res.status(404).json({ error: "Vendor profile not found" }); return; }

  // Validate scopes against what client is allowed
  const grantedScopes = (scopes ?? client.scopes).filter((s) => client.scopes.includes(s));

  // Issue authorization code
  const rawCode = `oac_${randomBytes(16).toString("hex")}`;
  const codeHash = sha256(rawCode);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await db.insert(oauthTokensTable).values({
    vendorId:  vendor.id,
    clientId,
    tokenHash: codeHash,
    tokenType: "authorization_code",
    scopes:    grantedScopes,
    expiresAt,
  });

  const url = new URL(redirectUri);
  url.searchParams.set("code", rawCode);
  if (state) url.searchParams.set("state", state);

  res.json({ redirectUrl: url.toString() });
});

// ── Token exchange (public — called by third-party backend) ───────────────────

router.post("/oauth/token", async (req, res): Promise<void> => {
  const { grant_type, code, client_id, client_secret, redirect_uri } = req.body as Record<string, string>;

  if (grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type", error_description: "Only authorization_code is supported" });
    return;
  }
  if (!code || !client_id || !client_secret) {
    res.status(400).json({ error: "invalid_request", error_description: "code, client_id, and client_secret are required" });
    return;
  }

  // Verify client credentials
  const [client] = await db.select().from(oauthClientsTable)
    .where(and(eq(oauthClientsTable.clientId, client_id), eq(oauthClientsTable.isActive, true))).limit(1);
  if (!client || client.clientSecretHash !== sha256(client_secret)) {
    res.status(401).json({ error: "invalid_client", error_description: "Invalid client credentials" });
    return;
  }
  if (redirect_uri && !client.redirectUris.includes(redirect_uri)) {
    res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
    return;
  }

  // Find and validate the authorization code
  const codeHash = sha256(code);
  const now = new Date();
  const [authCode] = await db.select().from(oauthTokensTable)
    .where(and(
      eq(oauthTokensTable.tokenHash, codeHash),
      eq(oauthTokensTable.tokenType, "authorization_code"),
      eq(oauthTokensTable.clientId, client_id),
      isNull(oauthTokensTable.usedAt),
      isNull(oauthTokensTable.revokedAt),
      gt(oauthTokensTable.expiresAt!, now),
    )).limit(1);

  if (!authCode) {
    res.status(400).json({ error: "invalid_grant", error_description: "Authorization code is invalid, expired, or already used" });
    return;
  }

  // Mark code as used (single-use)
  await db.update(oauthTokensTable).set({ usedAt: now }).where(eq(oauthTokensTable.id, authCode.id));

  // Issue access token
  const rawToken = `oat_${randomBytes(24).toString("hex")}`;
  const tokenHash = sha256(rawToken);
  const tokenExpiry = new Date(Date.now() + TOKEN_TTL_MS);

  const [token] = await db.insert(oauthTokensTable).values({
    vendorId:  authCode.vendorId,
    clientId:  client_id,
    tokenHash,
    tokenType: "access_token",
    scopes:    authCode.scopes,
    expiresAt: tokenExpiry,
  }).returning();

  res.json({
    access_token: rawToken,
    token_type:   "Bearer",
    expires_in:   Math.floor(TOKEN_TTL_MS / 1000),
    scope:        token.scopes.join(" "),
  });
});

// ── Revoke token (public) ──────────────────────────────────────────────────────

router.post("/oauth/revoke", async (req, res): Promise<void> => {
  const { token } = req.body as { token?: string };
  if (!token) { res.status(400).json({ error: "token is required" }); return; }

  const hash = sha256(token);
  await db.update(oauthTokensTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthTokensTable.tokenHash, hash), isNull(oauthTokensTable.revokedAt)));

  // RFC 7009: always return 200 even if the token wasn't found
  res.json({ ok: true });
});

export default router;
