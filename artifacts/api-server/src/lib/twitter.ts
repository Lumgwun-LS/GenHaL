/**
 * X (Twitter) API v2 client — OAuth 2.0 Authorization Code + PKCE for connecting
 * a vendor's own X account, and posting tweets (text and single-image) to it.
 *
 * Requires X_CLIENT_ID / X_CLIENT_SECRET from a real X developer app (a
 * confidential "Web App" client with OAuth 2.0 enabled and
 * "tweet.read tweet.write users.read offline.access" scopes). These are not
 * platform secrets we can supply — each deployment needs its own app, same as
 * Meta and LinkedIn.
 */
import { createHash, randomBytes } from "node:crypto";

const X_API_BASE = "https://api.twitter.com/2";
const X_UPLOAD_BASE = "https://upload.twitter.com/1.1";

export function isTwitterConfigured(): boolean {
  return Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);
}

function requireTwitterEnv(): { clientId: string; clientSecret: string } {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "X/Twitter connection is not configured. Add X_CLIENT_ID and X_CLIENT_SECRET (from an X developer app) to connect real accounts.",
    );
  }
  return { clientId, clientSecret };
}

const OAUTH_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"].join(" ");

/** Generates a PKCE code_verifier + its S256 code_challenge. */
export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function buildTwitterAuthUrl(state: string, redirectUri: string, codeChallenge: string): string {
  const { clientId } = requireTwitterEnv();
  const url = new URL("https://twitter.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", OAUTH_SCOPES);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** Exchanges the OAuth "code" from the redirect callback for an access token, using the matching PKCE verifier. */
export async function exchangeCodeForAccessToken(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ accessToken: string; expiresInSeconds: number | null }> {
  const { clientId, clientSecret } = requireTwitterEnv();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${X_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(json?.error_description || json?.error || "X did not return an access token");
  return { accessToken: json.access_token as string, expiresInSeconds: json.expires_in ?? null };
}

export interface TwitterProfile {
  userId: string;
  username: string;
  name: string;
}

/** Fetches the authenticated user's own X profile (id + handle + display name). */
export async function fetchTwitterProfile(accessToken: string): Promise<TwitterProfile> {
  const res = await fetch(`${X_API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.data?.id) throw new Error(json?.detail || json?.title || "Failed to load the X profile");
  return { userId: json.data.id as string, username: json.data.username as string, name: json.data.name ?? json.data.username };
}

export interface PublishResult {
  externalPostId: string;
  externalUrl: string;
}

/** Posts a text-only tweet to the connected account. */
export async function publishTweet(username: string, accessToken: string, text: string): Promise<PublishResult> {
  const res = await fetch(`${X_API_BASE}/tweets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.data?.id) throw new Error(json?.detail || json?.title || `X rejected the tweet (${res.status})`);
  return { externalPostId: json.data.id as string, externalUrl: `https://twitter.com/${username}/status/${json.data.id}` };
}

/** Uploads a single image via the v1.1 media endpoint (OAuth 2.0 user-context Bearer token), then posts a tweet attaching it. */
export async function publishTweetWithImage(
  username: string,
  accessToken: string,
  imageBuffer: Buffer,
  text: string,
): Promise<PublishResult> {
  const form = new FormData();
  form.append("media", new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }), "post.png");
  const uploadRes = await fetch(`${X_UPLOAD_BASE}/media/upload.json`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const uploadJson: any = await uploadRes.json().catch(() => ({}));
  const mediaId = uploadJson?.media_id_string;
  if (!uploadRes.ok || !mediaId) throw new Error(uploadJson?.error || uploadJson?.errors?.[0]?.message || "X rejected the image upload");

  const res = await fetch(`${X_API_BASE}/tweets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, media: { media_ids: [mediaId] } }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.data?.id) throw new Error(json?.detail || json?.title || `X rejected the tweet (${res.status})`);
  return { externalPostId: json.data.id as string, externalUrl: `https://twitter.com/${username}/status/${json.data.id}` };
}
