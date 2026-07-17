/**
 * ads-platforms.ts
 *
 * Platform adapters for the Ads Suite.
 *
 * Supported platforms:
 *   Meta   — Facebook + Instagram Ads (Marketing API v19.0)
 *   Twitter — X Ads API v12 (OAuth 1.0a)
 *
 * Platforms pending developer-programme approval (stubs only):
 *   LinkedIn, Google Ads / YouTube, TikTok for Business
 */

import { createHmac, randomBytes } from "node:crypto";
import { logger } from "./logger";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface AdPublishResult {
  connected: boolean;
  platformCampaignId?: string;
  platformAdsetId?: string;
  platformAdId?: string;
  error?: string;
}

export interface AdAnalyticsResult {
  connected: boolean;
  data?: {
    date: string;
    impressions: number;
    clicks: number;
    spend: number;
    reach: number;
    conversions: number;
  }[];
  error?: string;
}

export interface AdCreativeInput {
  headline?: string | null;
  body?: string | null;
  cta?: string | null;
  imageUrl?: string | null;
}

export interface AdCampaignInput {
  name: string;
  objective: string;
  budgetAmount?: string | null;
  budgetCurrency?: string;
  startDate?: string | null;
  endDate?: string | null;
  audienceJson?: unknown;
  creative?: AdCreativeInput;
}

/** Explicit per-vendor credentials resolved by the publish route. */
export interface MetaAdCreds {
  accessToken: string;   // long-lived user token with ads_management scope
  adAccountId: string;   // e.g. "act_123456789"
}

export interface TwitterAdCreds {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  accountId: string;     // numeric Twitter Ads account ID
}

// ── Objective maps ────────────────────────────────────────────────────────────

const META_OBJECTIVE_MAP: Record<string, string> = {
  awareness:      "BRAND_AWARENESS",
  traffic:        "LINK_CLICKS",
  engagement:     "ENGAGEMENT",
  leads:          "LEAD_GENERATION",
  sales:          "CONVERSIONS",
  app_promotion:  "APP_INSTALLS",
  video_views:    "VIDEO_VIEWS",
};

const TWITTER_OBJECTIVE_MAP: Record<string, string> = {
  awareness:      "REACH",
  traffic:        "WEBSITE_CLICKS",
  engagement:     "TWEET_ENGAGEMENTS",
  leads:          "WEBSITE_CONVERSIONS",
  sales:          "WEBSITE_CONVERSIONS",
  video_views:    "VIDEO_VIEWS",
  app_promotion:  "APP_ENGAGEMENTS",
};

// ── OAuth 1.0a signer (for X / Twitter Ads API) ───────────────────────────────

function pct(s: string): string {
  return encodeURIComponent(s);
}

function oauthSign(
  method: string,
  url: string,
  oauthParams: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): string {
  const sorted = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${pct(k)}=${pct(v)}`)
    .join("&");
  const baseString = `${method}&${pct(url)}&${pct(sorted)}`;
  const signingKey = `${pct(consumerSecret)}&${pct(tokenSecret)}`;
  return createHmac("sha1", signingKey).update(baseString).digest("base64");
}

function buildOAuthHeader(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessTokenSecret: string,
): string {
  const nonce = randomBytes(16).toString("hex");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const params: Record<string, string> = {
    oauth_consumer_key:     consumerKey,
    oauth_nonce:            nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp:        timestamp,
    oauth_token:            accessToken,
    oauth_version:          "1.0",
  };
  params["oauth_signature"] = oauthSign(method, url, params, consumerSecret, accessTokenSecret);
  const header = Object.entries(params)
    .map(([k, v]) => `${pct(k)}="${pct(v)}"`)
    .join(", ");
  return `OAuth ${header}`;
}

// ── Meta (Facebook & Instagram) — Marketing API v19.0 ────────────────────────

const META_BASE = "https://graph.facebook.com/v19.0";

async function metaPost<T = Record<string, unknown>>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${META_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: accessToken }),
  });
  const json = await res.json() as T & { error?: { message: string; code: number } };
  if ((json as any).error) {
    throw new Error((json as any).error.message ?? `Meta API error on /${path}`);
  }
  return json;
}

export async function publishMetaAd(
  campaign: AdCampaignInput,
  creds: MetaAdCreds,
): Promise<AdPublishResult> {
  const acct = creds.adAccountId.startsWith("act_")
    ? creds.adAccountId
    : `act_${creds.adAccountId}`;
  const token = creds.accessToken;

  logger.info({ name: campaign.name, acct }, "[ads-meta] Creating campaign");

  // 1. Campaign
  const campaignData = await metaPost<{ id: string }>(
    `${acct}/campaigns`,
    token,
    {
      name: campaign.name,
      objective: META_OBJECTIVE_MAP[campaign.objective] ?? "BRAND_AWARENESS",
      status: "PAUSED",
      special_ad_categories: [],
    },
  );
  const platformCampaignId = campaignData.id;

  // 2. Ad Set
  const audience = (campaign.audienceJson ?? {}) as Record<string, unknown>;
  const dailyBudgetCents = campaign.budgetAmount
    ? Math.round(Number(campaign.budgetAmount) * 100)
    : 1000;  // $10 minimum floor

  const targeting: Record<string, unknown> = {
    age_min: Number(audience["ageMin"]) || 18,
    age_max: Number(audience["ageMax"]) || 65,
  };
  if (audience["gender"] === "male")   targeting["genders"] = [1];
  if (audience["gender"] === "female") targeting["genders"] = [2];

  const adsetBody: Record<string, unknown> = {
    name: `${campaign.name} — Ad Set`,
    campaign_id: platformCampaignId,
    optimization_goal: "REACH",
    billing_event: "IMPRESSIONS",
    daily_budget: dailyBudgetCents,
    targeting,
    status: "PAUSED",
  };
  if (campaign.startDate) adsetBody["start_time"] = campaign.startDate;
  if (campaign.endDate)   adsetBody["end_time"]   = campaign.endDate;

  const adsetData = await metaPost<{ id: string }>(`${acct}/adsets`, token, adsetBody);
  const platformAdsetId = adsetData.id;

  // 3. Ad Creative + Ad (only when an image URL is provided)
  let platformAdId: string | undefined;
  if (campaign.creative?.imageUrl) {
    try {
      const creativeData = await metaPost<{ id: string }>(
        `${acct}/adcreatives`,
        token,
        {
          name: `${campaign.name} — Creative`,
          object_story_spec: {
            // page_id is required for link ads. We use the ad account itself as
            // a fallback. Vendors who publish to a specific Page should connect
            // that Page in Social Hub and we'll surface the Page ID there.
            page_id: acct.replace("act_", ""),
            link_data: {
              image_url: campaign.creative.imageUrl,
              message:   campaign.creative.body    ?? "",
              name:      campaign.creative.headline ?? campaign.name,
              call_to_action: { type: "LEARN_MORE" },
            },
          },
        },
      );
      const adData = await metaPost<{ id: string }>(
        `${acct}/ads`,
        token,
        {
          name: `${campaign.name} — Ad`,
          adset_id: platformAdsetId,
          creative: { creative_id: creativeData.id },
          status: "PAUSED",
        },
      );
      platformAdId = adData.id;
    } catch (creativeErr) {
      // Creative creation is best-effort; campaign + ad set are the important parts
      logger.warn({ err: creativeErr }, "[ads-meta] Ad creative creation failed — campaign/adset still saved");
    }
  }

  logger.info({ platformCampaignId, platformAdsetId, platformAdId }, "[ads-meta] Campaign published");
  return { connected: true, platformCampaignId, platformAdsetId, platformAdId };
}

export async function fetchMetaAnalytics(
  platformCampaignId: string,
  since: string,
  until: string,
  accessToken: string,
): Promise<AdAnalyticsResult> {
  const url =
    `${META_BASE}/${platformCampaignId}/insights` +
    `?fields=date_start,impressions,clicks,spend,reach,actions` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    `&level=campaign` +
    `&time_increment=1` +
    `&access_token=${encodeURIComponent(accessToken)}`;

  const res = await fetch(url);
  const json = await res.json() as { data?: unknown[]; error?: { message: string } };
  if (json.error) {
    return { connected: true, error: json.error.message, data: [] };
  }

  const data = ((json.data ?? []) as Record<string, unknown>[]).map((row) => {
    const conversions = ((row["actions"] ?? []) as Array<{ action_type: string; value: string }>)
      .filter((a) => a.action_type === "purchase" || a.action_type === "lead")
      .reduce((sum, a) => sum + Number(a.value), 0);
    return {
      date:        String(row["date_start"] ?? since),
      impressions: Number(row["impressions"] ?? 0),
      clicks:      Number(row["clicks"]      ?? 0),
      spend:       Number(row["spend"]        ?? 0),
      reach:       Number(row["reach"]        ?? 0),
      conversions,
    };
  });

  return { connected: true, data };
}

// ── X / Twitter Ads — v12 ──────────────────────────────────────────────────────

const XADS_BASE = "https://ads-api.x.com/12";

function getXAdsCreds(): TwitterAdCreds | null {
  const { X_ADS_CONSUMER_KEY, X_ADS_CONSUMER_SECRET, X_ADS_ACCESS_TOKEN, X_ADS_ACCESS_TOKEN_SECRET } = process.env;
  if (!X_ADS_CONSUMER_KEY || !X_ADS_CONSUMER_SECRET || !X_ADS_ACCESS_TOKEN || !X_ADS_ACCESS_TOKEN_SECRET) {
    return null;
  }
  return {
    consumerKey:        X_ADS_CONSUMER_KEY,
    consumerSecret:     X_ADS_CONSUMER_SECRET,
    accessToken:        X_ADS_ACCESS_TOKEN,
    accessTokenSecret:  X_ADS_ACCESS_TOKEN_SECRET,
    accountId:          "",  // filled in per-vendor
  };
}

async function xAdsRequest<T = unknown>(
  method: "GET" | "POST",
  path: string,
  creds: TwitterAdCreds,
  body?: Record<string, string>,
): Promise<T> {
  const url = `${XADS_BASE}${path}`;
  const authHeader = buildOAuthHeader(method, url, creds.consumerKey, creds.consumerSecret, creds.accessToken, creds.accessTokenSecret);

  const init: RequestInit = {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };
  if (body && method === "POST") {
    init.body = new URLSearchParams(body).toString();
  }

  const res = await fetch(url, init);
  const json = await res.json() as T & { errors?: Array<{ message: string }> };
  if ((json as any).errors?.length) {
    throw new Error((json as any).errors[0].message ?? "X Ads API error");
  }
  return json;
}

export async function publishTwitterAd(
  campaign: AdCampaignInput,
  accountId: string,
): Promise<AdPublishResult> {
  const platformCreds = getXAdsCreds();
  if (!platformCreds) {
    return {
      connected: false,
      error:
        "X Ads credentials not configured. Add X_ADS_CONSUMER_KEY, X_ADS_CONSUMER_SECRET, " +
        "X_ADS_ACCESS_TOKEN, and X_ADS_ACCESS_TOKEN_SECRET as Replit secrets.",
    };
  }
  const creds: TwitterAdCreds = { ...platformCreds, accountId };

  logger.info({ name: campaign.name, accountId }, "[ads-twitter] Creating X Ads campaign");

  // 1. Campaign
  const campaignRes = await xAdsRequest<{ data: { id: string } }>(
    "POST",
    `/accounts/${accountId}/campaigns`,
    creds,
    {
      name:           campaign.name,
      funding_instrument_id: "", // caller must pre-set; left blank → X API will error clearly
      daily_budget_amount_local_micro: String(
        campaign.budgetAmount ? Math.round(Number(campaign.budgetAmount) * 1_000_000) : 5_000_000,
      ),
      entity_status: "PAUSED",
    },
  );
  const platformCampaignId = campaignRes.data.id;

  // 2. Line item (ad set equivalent)
  const lineItemRes = await xAdsRequest<{ data: { id: string } }>(
    "POST",
    `/accounts/${accountId}/line_items`,
    creds,
    {
      campaign_id:   platformCampaignId,
      name:          `${campaign.name} — Line Item`,
      objective:     TWITTER_OBJECTIVE_MAP[campaign.objective] ?? "REACH",
      bid_type:      "AUTO",
      entity_status: "PAUSED",
    },
  );
  const platformAdsetId = lineItemRes.data.id;

  logger.info({ platformCampaignId, platformAdsetId }, "[ads-twitter] Campaign published");
  return { connected: true, platformCampaignId, platformAdsetId };
}

export async function fetchTwitterAnalytics(
  platformCampaignId: string,
  accountId: string,
  since: string,
  until: string,
): Promise<AdAnalyticsResult> {
  const platformCreds = getXAdsCreds();
  if (!platformCreds) return { connected: false, error: "X Ads credentials not configured." };
  const creds: TwitterAdCreds = { ...platformCreds, accountId };

  const path =
    `/stats/accounts/${accountId}` +
    `?entity=CAMPAIGN` +
    `&entity_ids=${platformCampaignId}` +
    `&metric_groups=ENGAGEMENT,BILLING` +
    `&start_time=${since}T00:00:00Z` +
    `&end_time=${until}T23:59:59Z` +
    `&granularity=DAY`;

  const json = await xAdsRequest<{ data?: Array<{ id: string; id_data: Array<{ segment_name: string; metrics: Record<string, number[]> }> }> }>(
    "GET", path, creds,
  );

  const data = (json.data ?? []).flatMap((entry) =>
    (entry.id_data ?? []).map((seg) => ({
      date:        seg.segment_name ?? since,
      impressions: (seg.metrics["impressions"] ?? [0])[0]!,
      clicks:      (seg.metrics["clicks"]      ?? [0])[0]!,
      spend:       ((seg.metrics["billed_charge_local_micro"] ?? [0])[0]!) / 1_000_000,
      reach:       (seg.metrics["reach"]        ?? [0])[0]!,
      conversions: (seg.metrics["conversions"]  ?? [0])[0]!,
    })),
  );

  return { connected: true, data };
}

// ── Stubs for platforms needing developer-programme approval ──────────────────

export async function publishLinkedInAd(_c: AdCampaignInput): Promise<AdPublishResult> {
  return {
    connected: false,
    error: "LinkedIn Ads integration is pending Marketing Developer Platform approval. " +
           "Apply at linkedin.com/help/lms and add LINKEDIN_ADS_ACCESS_TOKEN + LINKEDIN_ADS_ACCOUNT_ID once approved.",
  };
}

export async function publishGoogleAd(_c: AdCampaignInput): Promise<AdPublishResult> {
  return {
    connected: false,
    error: "Google Ads integration requires a Developer Token and OAuth setup. " +
           "Add GOOGLE_ADS_DEVELOPER_TOKEN + GOOGLE_ADS_REFRESH_TOKEN to enable.",
  };
}

export async function publishTikTokAd(_c: AdCampaignInput): Promise<AdPublishResult> {
  return {
    connected: false,
    error: "TikTok for Business Ads requires a TikTok App with Ads API access. " +
           "Add TIKTOK_ADS_ACCESS_TOKEN + TIKTOK_ADS_ADVERTISER_ID once your app is approved.",
  };
}

// ── Platform routing ──────────────────────────────────────────────────────────

/** Maps campaign.platform (display name) to canonical ad-account platform key. */
export function toAdPlatform(campaignPlatform: string): string {
  const p = campaignPlatform.toLowerCase();
  if (p === "facebook" || p === "instagram") return "meta";
  if (p.includes("twitter") || p.startsWith("x (") || p === "x") return "twitter";
  if (p === "google ads" || p === "youtube") return "google";
  return p; // tiktok, linkedin pass through as-is
}

/**
 * Maps campaign.platform to the social_accounts.platform value that holds the
 * vendor's OAuth access token for that platform.
 */
export function toSocialPlatform(campaignPlatform: string): string {
  const p = campaignPlatform.toLowerCase();
  if (p === "facebook") return "Facebook";
  if (p === "instagram") return "Instagram";
  if (p.includes("twitter") || p.startsWith("x (") || p === "x") return "Twitter";
  if (p === "linkedin") return "LinkedIn";
  return campaignPlatform;
}

export async function publishAdCampaign(
  platform: string,
  campaign: AdCampaignInput,
  metaCreds?: MetaAdCreds,
  twitterAccountId?: string,
): Promise<AdPublishResult> {
  const adPlatform = toAdPlatform(platform);

  switch (adPlatform) {
    case "meta":
      if (!metaCreds) {
        return {
          connected: false,
          error: "No Meta ad account connected. Connect your Facebook/Instagram ad account in Ads Manager.",
        };
      }
      return publishMetaAd(campaign, metaCreds);

    case "twitter":
      if (!twitterAccountId) {
        return {
          connected: false,
          error: "No X Ads account connected. Connect your X (Twitter) ad account in Ads Manager.",
        };
      }
      return publishTwitterAd(campaign, twitterAccountId);

    case "linkedin":
      return publishLinkedInAd(campaign);

    case "google":
      return publishGoogleAd(campaign);

    case "tiktok":
      return publishTikTokAd(campaign);

    default:
      return { connected: false, error: `Platform "${platform}" is not supported yet.` };
  }
}

export async function fetchAdAnalytics(
  platform: string,
  platformCampaignId: string,
  since: string,
  until: string,
  metaCreds?: Pick<MetaAdCreds, "accessToken">,
  twitterAccountId?: string,
): Promise<AdAnalyticsResult> {
  const adPlatform = toAdPlatform(platform);

  switch (adPlatform) {
    case "meta":
      if (!metaCreds) return { connected: false, error: "No Meta ad account connected." };
      return fetchMetaAnalytics(platformCampaignId, since, until, metaCreds.accessToken);

    case "twitter":
      if (!twitterAccountId) return { connected: false, error: "No X Ads account connected." };
      return fetchTwitterAnalytics(platformCampaignId, twitterAccountId, since, until);

    default:
      return { connected: false, error: `Analytics not available for "${platform}" yet.` };
  }
}
