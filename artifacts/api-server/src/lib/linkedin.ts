/**
 * LinkedIn OAuth (Sign In with LinkedIn using OpenID Connect) + publishing to
 * the connected member's own feed via the LinkedIn Posts API.
 *
 * Requires LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET from a real LinkedIn
 * developer app with the "Sign In with LinkedIn using OpenID Connect" product
 * added, plus the "Share on LinkedIn" product (for the w_member_social scope)
 * approved for the app. These are not platform secrets we can supply — each
 * deployment needs its own app, same as Meta.
 *
 * LinkedIn's consumer API only supports posting to the authenticated member's
 * personal profile, not a Company Page (Page posting needs the separate,
 * partner-gated Marketing API) — so a "LinkedIn" connection here represents
 * the vendor's own profile.
 */
const LINKEDIN_API_BASE = "https://api.linkedin.com/v2";
const LINKEDIN_REST_BASE = "https://api.linkedin.com/rest";
const LINKEDIN_API_VERSION = "202401";

export function isLinkedInConfigured(): boolean {
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

function requireLinkedInEnv(): { clientId: string; clientSecret: string } {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "LinkedIn connection is not configured. Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET (from a LinkedIn developer app) to connect real accounts.",
    );
  }
  return { clientId, clientSecret };
}

const OAUTH_SCOPES = ["openid", "profile", "w_member_social"].join(" ");

export function buildLinkedInAuthUrl(state: string, redirectUri: string): string {
  const { clientId } = requireLinkedInEnv();
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", OAUTH_SCOPES);
  return url.toString();
}

export interface LinkedInTokenResult {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number | null;
}

/**
 * Exchanges the OAuth "code" from the redirect callback for a member access
 * token (~60 days). LinkedIn only issues a `refresh_token` alongside it for
 * apps granted the "Programmatic refresh tokens" product — for apps without
 * it, `refreshToken` comes back null and that account can't be silently
 * renewed once its access token expires.
 */
export async function exchangeCodeForAccessToken(code: string, redirectUri: string): Promise<LinkedInTokenResult> {
  const { clientId, clientSecret } = requireLinkedInEnv();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(json?.error_description || "LinkedIn did not return an access token");
  return { accessToken: json.access_token as string, refreshToken: json.refresh_token ?? null, expiresInSeconds: json.expires_in ?? null };
}

/** Exchanges a stored refresh token for a fresh access token (only works for apps with "Programmatic refresh tokens" enabled). */
export async function refreshLinkedInAccessToken(refreshToken: string): Promise<LinkedInTokenResult> {
  const { clientId, clientSecret } = requireLinkedInEnv();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(json?.error_description || "LinkedIn refused to refresh the access token — the connection needs to be redone.");
  }
  return { accessToken: json.access_token as string, refreshToken: json.refresh_token ?? refreshToken, expiresInSeconds: json.expires_in ?? null };
}

/** Heuristic for "this LinkedIn API error means the access token is expired/invalid", used to trigger a refresh-and-retry. */
export function isLinkedInAuthError(message: string): boolean {
  return /invalid access token|expired|unauthorized|401/i.test(message);
}

export interface LinkedInProfile {
  memberId: string;
  name: string;
}

/** Fetches the authenticated member's OpenID Connect profile (id + display name). */
export async function fetchLinkedInProfile(accessToken: string): Promise<LinkedInProfile> {
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.sub) throw new Error(json?.message || "Failed to load the LinkedIn profile");
  return { memberId: json.sub as string, name: json.name ?? "LinkedIn member" };
}

export interface PublishResult {
  externalPostId: string;
  externalUrl: string;
}

/** Publishes a text-only post to the connected member's LinkedIn feed. */
export async function publishLinkedInTextPost(memberId: string, accessToken: string, commentary: string): Promise<PublishResult> {
  const res = await fetch(`${LINKEDIN_REST_BASE}/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": LINKEDIN_API_VERSION,
    },
    body: JSON.stringify({
      author: `urn:li:person:${memberId}`,
      commentary,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `LinkedIn rejected the post (${res.status})`);
  }
  // LinkedIn returns the new post's URN in the x-restli-id / x-linkedin-id response header, not the body.
  const postUrn = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || "";
  const externalPostId = postUrn.split(":").pop() || postUrn;
  return { externalPostId, externalUrl: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : "https://www.linkedin.com/feed/" };
}

/** Publishes an image + caption to the connected member's LinkedIn feed by uploading the image bytes directly. */
export async function publishLinkedInImagePost(memberId: string, accessToken: string, imageBuffer: Buffer, commentary: string): Promise<PublishResult> {
  const authorUrn = `urn:li:person:${memberId}`;
  const restliHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0",
    "LinkedIn-Version": LINKEDIN_API_VERSION,
  };

  // Step 1: register the upload to get a one-time upload URL + image URN.
  const initRes = await fetch(`${LINKEDIN_REST_BASE}/images?action=initializeUpload`, {
    method: "POST",
    headers: restliHeaders,
    body: JSON.stringify({ initializeUploadRequest: { owner: authorUrn } }),
  });
  const initJson: any = await initRes.json().catch(() => ({}));
  const uploadUrl = initJson?.value?.uploadUrl;
  const imageUrn = initJson?.value?.image;
  if (!initRes.ok || !uploadUrl || !imageUrn) throw new Error(initJson?.message || "LinkedIn rejected the image upload request");

  // Step 2: PUT the raw bytes to the one-time upload URL.
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: imageBuffer as unknown as BodyInit,
  });
  if (!uploadRes.ok) throw new Error(`LinkedIn image upload failed (${uploadRes.status})`);

  // Step 3: create the post referencing the uploaded image.
  const postRes = await fetch(`${LINKEDIN_REST_BASE}/posts`, {
    method: "POST",
    headers: restliHeaders,
    body: JSON.stringify({
      author: authorUrn,
      commentary,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: imageUrn } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!postRes.ok) {
    const text = await postRes.text().catch(() => "");
    throw new Error(text || `LinkedIn rejected the post (${postRes.status})`);
  }
  const postUrn = postRes.headers.get("x-restli-id") || postRes.headers.get("x-linkedin-id") || "";
  const externalPostId = postUrn.split(":").pop() || postUrn;
  return { externalPostId, externalUrl: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : "https://www.linkedin.com/feed/" };
}

/**
 * Publishes a video + caption to the connected member's LinkedIn feed via the
 * Videos API's multi-step upload: initializeUpload (allocates per-part upload
 * URLs sized to the file), PUT each part and collect its ETag, then
 * finalizeUpload with those ETags before referencing the video URN in a post.
 */
export async function publishLinkedInVideoPost(memberId: string, accessToken: string, videoBuffer: Buffer, commentary: string): Promise<PublishResult> {
  const authorUrn = `urn:li:person:${memberId}`;
  const restliHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0",
    "LinkedIn-Version": LINKEDIN_API_VERSION,
  };

  // Step 1: register the upload — LinkedIn returns one upload URL per byte
  // range it wants uploaded, sized for the given file length.
  const initRes = await fetch(`${LINKEDIN_REST_BASE}/videos?action=initializeUpload`, {
    method: "POST",
    headers: restliHeaders,
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: authorUrn,
        fileSizeBytes: videoBuffer.length,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    }),
  });
  const initJson: any = await initRes.json().catch(() => ({}));
  const uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] = initJson?.value?.uploadInstructions;
  const videoUrn = initJson?.value?.video;
  const uploadToken = initJson?.value?.uploadToken ?? "";
  if (!initRes.ok || !uploadInstructions?.length || !videoUrn) {
    throw new Error(initJson?.message || "LinkedIn rejected the video upload request");
  }

  // Step 2: PUT each byte range to its own upload URL, collecting the ETag
  // LinkedIn assigns each part — finalizeUpload needs them in order.
  const uploadedPartIds: string[] = [];
  for (const part of uploadInstructions) {
    const partRes = await fetch(part.uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: videoBuffer.subarray(part.firstByte, part.lastByte + 1) as unknown as BodyInit,
    });
    if (!partRes.ok) throw new Error(`LinkedIn video part upload failed (${partRes.status})`);
    const etag = partRes.headers.get("etag") ?? "";
    if (!etag) throw new Error("LinkedIn did not return an ETag for an uploaded video part");
    uploadedPartIds.push(etag);
  }

  // Step 3: finalize the upload so LinkedIn assembles the parts and starts processing.
  const finalizeRes = await fetch(`${LINKEDIN_REST_BASE}/videos?action=finalizeUpload`, {
    method: "POST",
    headers: restliHeaders,
    body: JSON.stringify({
      finalizeUploadRequest: { video: videoUrn, uploadToken, uploadedPartIds },
    }),
  });
  if (!finalizeRes.ok) {
    const text = await finalizeRes.text().catch(() => "");
    throw new Error(text || `LinkedIn rejected the video finalize request (${finalizeRes.status})`);
  }

  // Step 4: create the post referencing the uploaded video.
  const postRes = await fetch(`${LINKEDIN_REST_BASE}/posts`, {
    method: "POST",
    headers: restliHeaders,
    body: JSON.stringify({
      author: authorUrn,
      commentary,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: videoUrn } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!postRes.ok) {
    const text = await postRes.text().catch(() => "");
    throw new Error(text || `LinkedIn rejected the post (${postRes.status})`);
  }
  const postUrn = postRes.headers.get("x-restli-id") || postRes.headers.get("x-linkedin-id") || "";
  const externalPostId = postUrn.split(":").pop() || postUrn;
  return { externalPostId, externalUrl: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : "https://www.linkedin.com/feed/" };
}
