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

export interface TwitterTokenResult {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number | null;
}

/** Exchanges the OAuth "code" from the redirect callback for an access token, using the matching PKCE verifier. Requesting the "offline.access" scope also returns a refresh token, needed to renew the ~2h access token without the vendor redoing OAuth. */
export async function exchangeCodeForAccessToken(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<TwitterTokenResult> {
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
  return { accessToken: json.access_token as string, refreshToken: json.refresh_token ?? null, expiresInSeconds: json.expires_in ?? null };
}

/**
 * Exchanges a stored refresh token for a fresh access token. X rotates the
 * refresh token on every use (the old one stops working), so callers must
 * persist the new `refreshToken` from the result, not just the access token.
 */
export async function refreshTwitterAccessToken(refreshToken: string): Promise<TwitterTokenResult> {
  const { clientId, clientSecret } = requireTwitterEnv();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
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
  if (!res.ok || !json.access_token) {
    throw new Error(json?.error_description || json?.error || "X refused to refresh the access token — the connection needs to be redone.");
  }
  return { accessToken: json.access_token as string, refreshToken: json.refresh_token ?? refreshToken, expiresInSeconds: json.expires_in ?? null };
}

/** Heuristic for "this X API error means the access token is expired/invalid", used to trigger a refresh-and-retry. */
export function isTwitterAuthError(message: string): boolean {
  return /unauthorized|invalid.*token|expired.*token|could not authenticate/i.test(message);
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

const VIDEO_APPEND_CHUNK_BYTES = 4 * 1024 * 1024; // 4MB, well under X's 5MB-per-chunk limit

/**
 * Uploads a video via the v1.1 chunked media endpoint's INIT/APPEND/FINALIZE
 * sequence (required for video — the simple single-request upload used for
 * images only supports images/GIFs), waits for X's async processing to
 * finish, then posts a tweet attaching the resulting media_id.
 */
export async function publishTweetWithVideo(
  username: string,
  accessToken: string,
  videoBuffer: Buffer,
  text: string,
): Promise<PublishResult> {
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // INIT: declare the upload up front so X can allocate a media_id for it.
  const initForm = new URLSearchParams({
    command: "INIT",
    media_type: "video/mp4",
    total_bytes: String(videoBuffer.length),
    media_category: "tweet_video",
  });
  const initRes = await fetch(`${X_UPLOAD_BASE}/media/upload.json`, {
    method: "POST",
    headers: { ...authHeader, "Content-Type": "application/x-www-form-urlencoded" },
    body: initForm,
  });
  const initJson: any = await initRes.json().catch(() => ({}));
  const mediaId = initJson?.media_id_string;
  if (!initRes.ok || !mediaId) throw new Error(initJson?.error || initJson?.errors?.[0]?.message || "X rejected the video upload (INIT)");

  // APPEND: upload the video in sequential chunks under the same media_id.
  let segmentIndex = 0;
  for (let offset = 0; offset < videoBuffer.length; offset += VIDEO_APPEND_CHUNK_BYTES) {
    const chunk = videoBuffer.subarray(offset, offset + VIDEO_APPEND_CHUNK_BYTES);
    const appendForm = new FormData();
    appendForm.append("command", "APPEND");
    appendForm.append("media_id", mediaId);
    appendForm.append("segment_index", String(segmentIndex));
    appendForm.append("media", new Blob([new Uint8Array(chunk)]), "chunk");
    const appendRes = await fetch(`${X_UPLOAD_BASE}/media/upload.json`, {
      method: "POST",
      headers: authHeader,
      body: appendForm,
    });
    if (!appendRes.ok) {
      const appendJson: any = await appendRes.json().catch(() => ({}));
      throw new Error(appendJson?.error || appendJson?.errors?.[0]?.message || `X rejected a video chunk (${appendRes.status})`);
    }
    segmentIndex++;
  }

  // FINALIZE: tell X the upload is complete so it can start processing.
  const finalizeForm = new URLSearchParams({ command: "FINALIZE", media_id: mediaId });
  const finalizeRes = await fetch(`${X_UPLOAD_BASE}/media/upload.json`, {
    method: "POST",
    headers: { ...authHeader, "Content-Type": "application/x-www-form-urlencoded" },
    body: finalizeForm,
  });
  let finalizeJson: any = await finalizeRes.json().catch(() => ({}));
  if (!finalizeRes.ok) throw new Error(finalizeJson?.error || finalizeJson?.errors?.[0]?.message || "X rejected the video upload (FINALIZE)");

  // STATUS: video processing is asynchronous — poll until X reports success
  // (or fail fast on an explicit "failed" state) before attaching it to a tweet.
  let processingInfo = finalizeJson?.processing_info;
  const deadline = Date.now() + 60_000;
  while (processingInfo && processingInfo.state !== "succeeded") {
    if (processingInfo.state === "failed") {
      throw new Error(processingInfo?.error?.message || "X failed to process the uploaded video");
    }
    if (Date.now() > deadline) throw new Error("Timed out waiting for X to finish processing the uploaded video");
    const waitMs = Math.min(Math.max((processingInfo.check_after_secs ?? 1) * 1000, 1000), 5000);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    const statusRes = await fetch(`${X_UPLOAD_BASE}/media/upload.json?command=STATUS&media_id=${encodeURIComponent(mediaId)}`, {
      headers: authHeader,
    });
    const statusJson: any = await statusRes.json().catch(() => ({}));
    if (!statusRes.ok) throw new Error(statusJson?.error || statusJson?.errors?.[0]?.message || "Failed to check X video processing status");
    processingInfo = statusJson?.processing_info;
  }

  const res = await fetch(`${X_API_BASE}/tweets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, media: { media_ids: [mediaId] } }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.data?.id) throw new Error(json?.detail || json?.title || `X rejected the tweet (${res.status})`);
  return { externalPostId: json.data.id as string, externalUrl: `https://twitter.com/${username}/status/${json.data.id}` };
}
