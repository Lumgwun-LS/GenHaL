/**
 * Meta Graph API client — Facebook Login for Business OAuth + publishing to a
 * connected Facebook Page and its linked Instagram Business account.
 *
 * Requires META_APP_ID / META_APP_SECRET (a real Meta developer app, in either
 * Development mode with the vendor added as an app tester/admin, or Live mode
 * after App Review for pages_manage_posts / instagram_content_publish). These
 * are not platform secrets we can supply — each deployment needs its own app.
 */
const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export function isMetaConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

function requireMetaEnv(): { appId: string; appSecret: string } {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(
      "Facebook/Instagram connection is not configured. Add META_APP_ID and META_APP_SECRET (from a Meta developer app) to connect real accounts.",
    );
  }
  return { appId, appSecret };
}

const OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
].join(",");

export function buildMetaAuthUrl(state: string, redirectUri: string): string {
  const { appId } = requireMetaEnv();
  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", OAUTH_SCOPES);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

async function graphFetch(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || `Meta Graph API request failed (${res.status})`;
    throw new Error(message);
  }
  return json;
}

/** Exchanges the OAuth "code" from the redirect callback for a short-lived user access token. */
export async function exchangeCodeForUserToken(code: string, redirectUri: string): Promise<string> {
  const { appId, appSecret } = requireMetaEnv();
  const json = await graphFetch("/oauth/access_token", {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  if (!json.access_token) throw new Error("Meta did not return an access token");
  return json.access_token as string;
}

/** Trades a short-lived user token for a long-lived one (~60 days). */
export async function exchangeForLongLivedUserToken(shortLivedToken: string): Promise<{ accessToken: string; expiresInSeconds: number | null }> {
  const { appId, appSecret } = requireMetaEnv();
  const json = await graphFetch("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
  if (!json.access_token) throw new Error("Meta did not return a long-lived access token");
  return { accessToken: json.access_token as string, expiresInSeconds: json.expires_in ?? null };
}

/**
 * Re-exchanges a still-valid long-lived user token for a fresh ~60-day one —
 * Meta has no separate refresh_token grant, but calling the same
 * fb_exchange_token endpoint with a long-lived token (instead of a
 * short-lived one) simply extends it, which is how "renewal" works here.
 * Throws once the token has actually expired or been revoked, same as the
 * initial exchange.
 */
export async function refreshLongLivedUserToken(currentLongLivedToken: string): Promise<{ accessToken: string; expiresInSeconds: number | null }> {
  return exchangeForLongLivedUserToken(currentLongLivedToken);
}

/** Heuristic for "this Meta Graph API error means the access token is expired/invalid", used to trigger a refresh-and-retry. */
export function isMetaAuthError(message: string): boolean {
  return /session has expired|error validating access token|invalid oauth access token|access token could not be decrypted/i.test(message);
}

export interface ConnectedPage {
  id: string;
  name: string;
  accessToken: string;
  instagramBusinessAccountId: string | null;
  instagramUsername: string | null;
}

/** Lists the Facebook Pages the user manages, each with its own page access token and any linked Instagram Business account. */
export async function listManagedPages(userAccessToken: string): Promise<ConnectedPage[]> {
  const json = await graphFetch("/me/accounts", {
    access_token: userAccessToken,
    fields: "id,name,access_token,instagram_business_account{id,username}",
  });
  const data: any[] = json.data ?? [];
  return data.map((p) => ({
    id: p.id,
    name: p.name,
    accessToken: p.access_token,
    instagramBusinessAccountId: p.instagram_business_account?.id ?? null,
    instagramUsername: p.instagram_business_account?.username ?? null,
  }));
}

/**
 * Cheap liveness check for a stored Page/Instagram access token: fetches just
 * the `id` field for the account, which succeeds only if the token is still
 * valid and still has at least read access to that Page/IG account. Throws
 * with Meta's own error message (e.g. "Error validating access token") on
 * expiry or revocation, which the caller surfaces to the vendor/admin.
 */
export async function validateMetaAccessToken(accountId: string, accessToken: string): Promise<void> {
  await graphFetch(`/${accountId}`, { fields: "id", access_token: accessToken });
}

export interface PublishResult {
  externalPostId: string;
  externalUrl: string;
}

/** Publishes a caption-only post to a Facebook Page's feed. */
export async function publishFacebookFeedPost(pageId: string, pageAccessToken: string, message: string): Promise<PublishResult> {
  const res = await fetch(`${GRAPH_BASE}/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, access_token: pageAccessToken }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.id) throw new Error(json?.error?.message || "Facebook rejected the post");
  return { externalPostId: json.id, externalUrl: `https://www.facebook.com/${json.id}` };
}

/** Publishes an image + caption to a Facebook Page by uploading the image bytes directly (no public URL needed). */
export async function publishFacebookPhotoPost(
  pageId: string,
  pageAccessToken: string,
  imageBuffer: Buffer,
  caption: string,
): Promise<PublishResult> {
  const form = new FormData();
  form.append("caption", caption);
  form.append("access_token", pageAccessToken);
  form.append("source", new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }), "post.png");
  const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, { method: "POST", body: form });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.post_id) throw new Error(json?.error?.message || "Facebook rejected the photo post");
  return { externalPostId: json.post_id, externalUrl: `https://www.facebook.com/${json.post_id}` };
}

export interface FacebookVideoStatusCheck {
  status: "ready" | "error" | "processing";
  failureReason: string | null;
}

/**
 * Facebook processes an uploaded video asynchronously — the id returned by the
 * upload call exists immediately, but the video itself moves through
 * "processing" (and sometimes "error") states before it's actually viewable.
 * Performs exactly one status check (not a wait loop) — callers that need to
 * wait for the video to become ready must poll this themselves, on their own
 * schedule. Used by the background video-publish-finalizer job so the HTTP
 * request that kicks off the upload never blocks on this.
 */
export async function checkFacebookVideoStatus(videoId: string, accessToken: string): Promise<FacebookVideoStatusCheck> {
  const json = await graphFetch(`/${videoId}`, { fields: "status", access_token: accessToken }).catch((err) => {
    // A transient lookup failure shouldn't be mistaken for Facebook reporting
    // a real processing error — surface it distinctly.
    throw new Error(`Failed to check Facebook video processing status: ${err instanceof Error ? err.message : String(err)}`);
  });
  const videoStatus: string | undefined = json?.status?.video_status;

  if (videoStatus === "ready") return { status: "ready", failureReason: null };
  if (videoStatus === "error") {
    const reason =
      json?.status?.processing_progress?.error?.message ??
      json?.status?.error?.message ??
      "Facebook reported an error while processing the uploaded video.";
    return { status: "error", failureReason: reason };
  }
  return { status: "processing", failureReason: null };
}

export interface VideoUploadResult extends PublishResult {
  /** Always true — the video's Graph API id exists, but Facebook hasn't finished processing it yet. */
  processing: true;
}

/**
 * Uploads a video + caption to a Facebook Page's video endpoint and returns
 * as soon as Facebook accepts the bytes — it does NOT wait for Facebook's
 * async video processing to finish, which can take up to ~2 minutes and
 * previously blocked the publish HTTP request the whole time. The returned
 * id is real and immediately usable for lookups, but the video may not be
 * viewable yet; callers must treat this as "processing" (not "published")
 * and let the background video-publish-finalizer job (see
 * video-publish-finalizer.ts) poll checkFacebookVideoStatus and finalize the
 * publication record once Facebook reports ready/error.
 */
export async function publishFacebookVideoPost(
  pageId: string,
  pageAccessToken: string,
  videoBuffer: Buffer,
  caption: string,
): Promise<VideoUploadResult> {
  const form = new FormData();
  form.append("description", caption);
  form.append("access_token", pageAccessToken);
  form.append("source", new Blob([new Uint8Array(videoBuffer)], { type: "video/mp4" }), "post.mp4");
  const res = await fetch(`${GRAPH_BASE}/${pageId}/videos`, { method: "POST", body: form });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.id) throw new Error(json?.error?.message || "Facebook rejected the video post");

  return { externalPostId: json.id, externalUrl: `https://www.facebook.com/${json.id}`, processing: true };
}

/**
 * Publishes an image + caption to an Instagram Business account. Instagram's
 * Content Publishing API only accepts a publicly reachable image URL for the
 * container step — direct byte upload isn't supported, unlike Facebook Pages.
 */
export async function publishInstagramPhotoPost(
  igUserId: string,
  pageAccessToken: string,
  imageUrl: string,
  caption: string,
): Promise<PublishResult> {
  const container = await graphFetch(`/${igUserId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: pageAccessToken,
  }).catch((err) => {
    throw new Error(`Failed to create Instagram media container: ${err instanceof Error ? err.message : String(err)}`);
  });
  if (!container.id) throw new Error("Instagram did not return a media container id");

  const publish = await graphFetch(`/${igUserId}/media_publish`, {
    creation_id: container.id,
    access_token: pageAccessToken,
  });
  if (!publish.id) throw new Error("Instagram did not confirm the publish");
  return { externalPostId: publish.id, externalUrl: `https://www.instagram.com/p/${publish.id}` };
}
