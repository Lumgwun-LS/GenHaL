/**
 * ads-platforms.ts
 *
 * Thin adapter layer for the four supported ad platforms.
 * Each function checks whether the necessary credentials are present and
 * returns `{ connected: false }` gracefully when they're not — allowing the
 * UI to show a "connect credentials to activate" banner without crashing.
 *
 * Real platform API calls will be wired here once credentials are approved
 * and stored. The function signatures and return shapes are final so the
 * route layer won't need to change when credentials are added.
 */

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

// ── Credential resolution helpers ─────────────────────────────────────────────

/**
 * Reads per-platform ad credentials from environment variables.
 * These are not set by default — vendors/admins will configure them via the
 * platform settings panel once API access is approved.
 *
 * Convention: META_ADS_ACCESS_TOKEN, TIKTOK_ADS_ACCESS_TOKEN,
 *             LINKEDIN_ADS_ACCESS_TOKEN + LINKEDIN_ADS_ACCOUNT_ID
 */
function getMetaAdsCreds(): { accessToken: string; adAccountId: string } | null {
  const { META_ADS_ACCESS_TOKEN, META_ADS_ACCOUNT_ID } = process.env;
  if (!META_ADS_ACCESS_TOKEN || !META_ADS_ACCOUNT_ID) return null;
  return { accessToken: META_ADS_ACCESS_TOKEN, adAccountId: META_ADS_ACCOUNT_ID };
}

function getTikTokAdsCreds(): { accessToken: string; advertiserId: string } | null {
  const { TIKTOK_ADS_ACCESS_TOKEN, TIKTOK_ADS_ADVERTISER_ID } = process.env;
  if (!TIKTOK_ADS_ACCESS_TOKEN || !TIKTOK_ADS_ADVERTISER_ID) return null;
  return { accessToken: TIKTOK_ADS_ACCESS_TOKEN, advertiserId: TIKTOK_ADS_ADVERTISER_ID };
}

function getLinkedInAdsCreds(): { accessToken: string; accountId: string } | null {
  const { LINKEDIN_ADS_ACCESS_TOKEN, LINKEDIN_ADS_ACCOUNT_ID } = process.env;
  if (!LINKEDIN_ADS_ACCESS_TOKEN || !LINKEDIN_ADS_ACCOUNT_ID) return null;
  return { accessToken: LINKEDIN_ADS_ACCESS_TOKEN, accountId: LINKEDIN_ADS_ACCOUNT_ID };
}

// ── Meta (Facebook & Instagram) ───────────────────────────────────────────────

/**
 * Publish an ad campaign to Meta (Facebook/Instagram).
 * Real implementation will: create a Campaign → Ad Set → Ad via the
 * Marketing API (https://developers.facebook.com/docs/marketing-apis/).
 */
export async function publishMetaAd(campaign: AdCampaignInput): Promise<AdPublishResult> {
  const creds = getMetaAdsCreds();
  if (!creds) {
    logger.info("[ads-platforms] Meta ads credentials not configured — skipping publish");
    return { connected: false, error: "Meta Ads credentials not configured. Add META_ADS_ACCESS_TOKEN and META_ADS_ACCOUNT_ID to connect." };
  }

  // TODO: wire real Meta Marketing API calls once credentials are present.
  // Stub — returns a recognisable placeholder so the route layer can store it.
  logger.info({ name: campaign.name }, "[ads-platforms] Meta publish — credentials present but real API not yet wired");
  return {
    connected: true,
    platformCampaignId: `meta_campaign_stub_${Date.now()}`,
    platformAdsetId: `meta_adset_stub_${Date.now()}`,
    platformAdId: `meta_ad_stub_${Date.now()}`,
  };
}

export async function fetchMetaAnalytics(platformCampaignId: string, since: string, until: string): Promise<AdAnalyticsResult> {
  const creds = getMetaAdsCreds();
  if (!creds) return { connected: false, error: "Meta Ads credentials not configured." };

  // TODO: wire Meta Insights API call.
  logger.info({ platformCampaignId, since, until }, "[ads-platforms] Meta analytics fetch — credentials present but real API not yet wired");
  return { connected: true, data: [] };
}

// ── TikTok ────────────────────────────────────────────────────────────────────

/**
 * Publish an ad campaign to TikTok for Business.
 * Real implementation will use the TikTok Marketing API
 * (https://business-api.tiktok.com/portal/docs).
 */
export async function publishTikTokAd(campaign: AdCampaignInput): Promise<AdPublishResult> {
  const creds = getTikTokAdsCreds();
  if (!creds) {
    logger.info("[ads-platforms] TikTok ads credentials not configured — skipping publish");
    return { connected: false, error: "TikTok Ads credentials not configured. Add TIKTOK_ADS_ACCESS_TOKEN and TIKTOK_ADS_ADVERTISER_ID to connect." };
  }

  logger.info({ name: campaign.name }, "[ads-platforms] TikTok publish — credentials present but real API not yet wired");
  return {
    connected: true,
    platformCampaignId: `tiktok_campaign_stub_${Date.now()}`,
    platformAdsetId: `tiktok_adgroup_stub_${Date.now()}`,
    platformAdId: `tiktok_ad_stub_${Date.now()}`,
  };
}

export async function fetchTikTokAnalytics(platformCampaignId: string, since: string, until: string): Promise<AdAnalyticsResult> {
  const creds = getTikTokAdsCreds();
  if (!creds) return { connected: false, error: "TikTok Ads credentials not configured." };

  logger.info({ platformCampaignId, since, until }, "[ads-platforms] TikTok analytics fetch — credentials present but real API not yet wired");
  return { connected: true, data: [] };
}

// ── LinkedIn ──────────────────────────────────────────────────────────────────

/**
 * Publish an ad campaign to LinkedIn Campaign Manager.
 * Real implementation will use the LinkedIn Marketing API
 * (https://learn.microsoft.com/en-us/linkedin/marketing/).
 */
export async function publishLinkedInAd(campaign: AdCampaignInput): Promise<AdPublishResult> {
  const creds = getLinkedInAdsCreds();
  if (!creds) {
    logger.info("[ads-platforms] LinkedIn ads credentials not configured — skipping publish");
    return { connected: false, error: "LinkedIn Ads credentials not configured. Add LINKEDIN_ADS_ACCESS_TOKEN and LINKEDIN_ADS_ACCOUNT_ID to connect." };
  }

  logger.info({ name: campaign.name }, "[ads-platforms] LinkedIn publish — credentials present but real API not yet wired");
  return {
    connected: true,
    platformCampaignId: `li_campaign_stub_${Date.now()}`,
    platformAdsetId: `li_adgroup_stub_${Date.now()}`,
    platformAdId: `li_creative_stub_${Date.now()}`,
  };
}

export async function fetchLinkedInAnalytics(platformCampaignId: string, since: string, until: string): Promise<AdAnalyticsResult> {
  const creds = getLinkedInAdsCreds();
  if (!creds) return { connected: false, error: "LinkedIn Ads credentials not configured." };

  logger.info({ platformCampaignId, since, until }, "[ads-platforms] LinkedIn analytics fetch — credentials present but real API not yet wired");
  return { connected: true, data: [] };
}

// ── Dispatch helpers ──────────────────────────────────────────────────────────

/** Route the publish call to the right platform adapter. */
export async function publishAdCampaign(platform: string, campaign: AdCampaignInput): Promise<AdPublishResult> {
  switch (platform) {
    case "facebook":
    case "instagram":
      return publishMetaAd(campaign);
    case "tiktok":
      return publishTikTokAd(campaign);
    case "linkedin":
      return publishLinkedInAd(campaign);
    default:
      return { connected: false, error: `Platform "${platform}" is not supported yet.` };
  }
}

/** Route the analytics fetch to the right platform adapter. */
export async function fetchAdAnalytics(platform: string, platformCampaignId: string, since: string, until: string): Promise<AdAnalyticsResult> {
  switch (platform) {
    case "facebook":
    case "instagram":
      return fetchMetaAnalytics(platformCampaignId, since, until);
    case "tiktok":
      return fetchTikTokAnalytics(platformCampaignId, since, until);
    case "linkedin":
      return fetchLinkedInAnalytics(platformCampaignId, since, until);
    default:
      return { connected: false, error: `Platform "${platform}" is not supported yet.` };
  }
}
