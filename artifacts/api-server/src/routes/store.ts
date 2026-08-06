import { Router } from "express";
import multer from "multer";
import Stripe from "stripe";
import { db } from "@workspace/db";
import {
  storeAppsTable,
  storeDeveloperAccountsTable,
  storeAppVersionsTable,
  storeAppReviewsTable,
  storeLinkedAccountsTable,
  storeAppRepoLinksTable,
  storeAppUpdateRequestsTable,
  storeAppEventsTable,
  storeUserSignupsTable,
  storeOfflinePaymentsTable,
  storeUploadTrialsTable,
  storeAppSubscribersTable,
  leadsTable,
  personActivitiesTable,
  vendorsTable,
} from "@workspace/db";
import { eq, desc, asc, ilike, and, sql, or, gte, count, inArray, isNull, lt, isNotNull } from "drizzle-orm";
import { squadInitiatePayment, squadVerifyTransaction, resolveSquadKey, verifySquadWebhookSignature } from "../lib/squad";
import { storeGeneratedMedia } from "../lib/generated-media-storage";
import { ObjectStorageService } from "../lib/objectStorage";
import { isR2Configured, mirrorUrlToR2, uploadBufferToR2 } from "../lib/r2";
import { sendEmail } from "../lib/mailer";
import { wrapVendorEmail, escapeHtml } from "../lib/email-branding";

/** Best-effort country extraction from request headers (Cloudflare / Replit proxy). */
function extractCountry(req: import("express").Request): string | null {
  return (
    (req.headers["cf-ipcountry"] as string | undefined) ??
    (req.headers["x-country-code"] as string | undefined) ??
    null
  );
}

/** Extract region (state/province) from Cloudflare or forwarded headers. */
function extractRegion(req: import("express").Request): string | null {
  return (
    (req.headers["cf-ipregion"] as string | undefined) ??
    (req.headers["x-region"] as string | undefined) ??
    null
  );
}

/** Extract city from Cloudflare or forwarded headers. */
function extractCity(req: import("express").Request): string | null {
  return (
    (req.headers["cf-ipcity"] as string | undefined) ??
    (req.headers["x-city"] as string | undefined) ??
    null
  );
}

/** Fire-and-forget event insert — never blocks the response. */
function logAppEvent(appId: number, eventType: string, req: import("express").Request, extra?: { clerkUserId?: string; sessionId?: string }) {
  db.insert(storeAppEventsTable).values({
    appId,
    eventType,
    sessionId: extra?.sessionId ?? null,
    clerkUserId: extra?.clerkUserId ?? null,
    country: extractCountry(req),
    region: extractRegion(req),
    city: extractCity(req),
    userAgent: (req.headers["user-agent"] ?? "").slice(0, 512) || null,
  }).catch(() => {});
}
import { requireAuth, getAuth, clerkClient } from "@clerk/express";
import { logger } from "../lib/logger";
import { notifyAdminSignup } from "../lib/signup-notify";
import { sendLoginNotification } from "../lib/login-notify";
import { sendSlackAlert } from "../lib/slack";
import crypto from "crypto";

const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────

const PUBLISHING_FEE_KOBO     = 5_000_000; // NGN 50,000
const PUBLISHING_FEE_USD_CENTS = 10_000;   // USD $100

// All 54 African Union member states — full names and ISO-3166-1 alpha-2 codes
const AFRICAN_COUNTRY_NAMES = new Set([
  "Algeria","Angola","Benin","Botswana","Burkina Faso","Burundi",
  "Cabo Verde","Cape Verde","Cameroon","Central African Republic","Chad",
  "Comoros","Congo","Democratic Republic of the Congo","DR Congo","DRC",
  "Djibouti","Egypt","Equatorial Guinea","Eritrea","Eswatini","Swaziland",
  "Ethiopia","Gabon","Gambia","Ghana","Guinea","Guinea-Bissau",
  "Ivory Coast","Côte d'Ivoire","Cote d'Ivoire","Kenya","Lesotho","Liberia","Libya",
  "Madagascar","Malawi","Mali","Mauritania","Mauritius","Morocco",
  "Mozambique","Namibia","Niger","Nigeria","Rwanda",
  "São Tomé and Príncipe","Sao Tome and Principe","Senegal","Seychelles",
  "Sierra Leone","Somalia","South Africa","South Sudan","Sudan",
  "Tanzania","Togo","Tunisia","Uganda","Zambia","Zimbabwe",
]);
const AFRICAN_COUNTRY_CODES = new Set([
  "DZ","AO","BJ","BW","BF","BI","CV","CM","CF","TD","KM","CG","CD","DJ",
  "EG","GQ","ER","SZ","ET","GA","GM","GH","GN","GW","CI","KE","LS","LR",
  "LY","MG","MW","ML","MR","MU","MA","MZ","NA","NE","NG","RW","ST","SN",
  "SC","SL","SO","ZA","SS","SD","TZ","TG","TN","UG","ZM","ZW",
]);
/** Returns true for African countries (by full name or 2-letter code). Defaults to true (NGN) when unknown. */
function isAfricanCountry(country: string | null | undefined): boolean {
  if (!country) return true;
  const t = country.trim();
  return AFRICAN_COUNTRY_NAMES.has(t) || AFRICAN_COUNTRY_CODES.has(t.toUpperCase());
}

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? "";
const IS_MERCHANT_CODE = process.env.INTERSWITCH_MERCHANT_CODE ?? "";
const IS_PAY_ITEM_ID = process.env.INTERSWITCH_PAY_ITEM_ID ?? "";
const IS_SECRET_KEY = process.env.INTERSWITCH_SECRET_KEY ?? "";
const IS_CLIENT_ID = process.env.INTERSWITCH_CLIENT_ID ?? "";

function getBaseUrl(req: any): string {
  // Always derive from the incoming request so that custom domains
  // (awajimaaappstore.com, awajimaaai.com) produce the correct callback URL.
  // REPLIT_DEV_DOMAIN is the *dev-tunnel* hostname and must not be used in
  // production request handlers — it stays available only for tooling that
  // explicitly needs it (e.g. the Expo packager).
  const proto = (req.get("x-forwarded-proto") as string | undefined) ?? req.protocol ?? "https";
  const host  = req.get("host") as string;
  return `${proto}://${host}`;
}

// ─── Africa Categories ────────────────────────────────────────────────────────

export const AFRICA_CATEGORIES = [
  { name: "Mobile Money & Fintech", iconEmoji: "💳", color: "#00c853" },
  { name: "Agriculture & Farming", iconEmoji: "🌾", color: "#8bc34a" },
  { name: "Health & Telemedicine", iconEmoji: "🏥", color: "#26c6da" },
  { name: "Education & E-Learning", iconEmoji: "📚", color: "#7c4dff" },
  { name: "Logistics & Delivery", iconEmoji: "🚚", color: "#ff9800" },
  { name: "Food & Restaurant", iconEmoji: "🍲", color: "#f44336" },
  { name: "Entertainment & Music", iconEmoji: "🎵", color: "#e91e63" },
  { name: "Social & Community", iconEmoji: "🤝", color: "#2196f3" },
  { name: "Business & Commerce", iconEmoji: "💼", color: "#ffb300" },
  { name: "Government & E-Services", iconEmoji: "🏛️", color: "#546e7a" },
  { name: "Transport & Ride-Hailing", iconEmoji: "🚗", color: "#00bcd4" },
  { name: "Utilities & Infrastructure", iconEmoji: "⚡", color: "#ffc107" },
  { name: "Fashion & Beauty", iconEmoji: "👗", color: "#9c27b0" },
  { name: "Real Estate", iconEmoji: "🏠", color: "#795548" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORE_DOMAIN = "https://awajimaaappstore.com";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

/**
 * Generate a structured, URL-safe public app ID.
 *
 * Format (19 chars): {ts_base36(8)}{owner(4)}{rand(7)}
 *   ts_base36  — base-36 encoding of Date.now() in ms, chronologically sortable
 *   owner      — first 4 alphanum chars of the developer's clerkUserId (lowercase)
 *   rand       — 7 random base-36 chars (36^7 ≈ 78 billion combos)
 *
 * Comfortably unique across 500 billion+ apps and sortable by creation time.
 * Example: "lz7k8x4aaws4r2mk9p"
 */
function generatePublicId(clerkUserId?: string): string {
  const ts   = Date.now().toString(36).padStart(8, "0");
  const owner = (clerkUserId ?? "plat").replace(/[^a-z0-9]/gi, "").toLowerCase().padEnd(4, "0").slice(0, 4);
  const rand  = Math.random().toString(36).slice(2, 9).padEnd(7, "0");
  return `${ts}${owner}${rand}`;
}

function publicAppUrl(publicId: string | null | undefined): string | null {
  return publicId ? `${STORE_DOMAIN}/app/${publicId}` : null;
}

/** Permanent, shareable download link using the app's package ID (or slug fallback).
 *  e.g. https://awajimaaappstore.com/dl/com.awajimaa.myapp */
function canonicalDownloadUrl(app: any): string {
  const identifier = app.packageName || app.slug;
  return `${STORE_DOMAIN}/dl/${encodeURIComponent(identifier)}`;
}

function serializeVersion(v: any) {
  return {
    id: v.id,
    appId: v.appId,
    version: v.version,
    versionCode: v.versionCode ?? null,
    releaseNotes: v.releaseNotes ?? null,
    fileUrl: v.fileUrl ?? null,
    fileSize: v.fileSize ?? null,
    minOsVersion: v.minOsVersion ?? null,
    uploadedByClerkId: v.uploadedByClerkId ?? null,
    status: v.status,
    activatedAt: v.activatedAt?.toISOString?.() ?? null,
    activatedByClerkId: v.activatedByClerkId ?? null,
    createdAt: v.createdAt?.toISOString?.() ?? null,
  };
}

function serializeApp(app: any, developer?: any) {
  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    tagline: app.tagline,
    description: app.description,
    category: app.category,
    categories: (app.categories as string[])?.length > 0 ? (app.categories as string[]) : [app.category],
    platform: app.platform,
    iconUrl: app.iconUrl,
    screenshots: (app.screenshots as string[]) ?? [],
    packageName: app.packageName ?? null,
    downloadUrl: app.downloadUrl ?? null,
    canonicalDownloadUrl: canonicalDownloadUrl(app),
    webUrl: app.webUrl ?? null,
    currentVersion: app.currentVersion ?? null,
    rating: app.rating,
    ratingCount: app.ratingCount,
    totalDownloads: app.totalDownloads,
    status: app.status,
    isFeatured: app.isFeatured,
    publishingFeePaid: app.publishingFeePaid ?? false,
    publishingFeeGateway: app.publishingFeeGateway ?? null,
    developerId: app.developerId,
    developerName: developer?.displayName ?? "Unknown",
    developerWebsite: developer?.website ?? null,
    aiSummary: app.aiSummary ?? null,
    aiCategory: app.aiCategory ?? null,
    aiPolicyFlags: app.aiPolicyFlags ?? null,
    aiReviewScore: app.aiReviewScore ?? null,
    rejectionReason: app.rejectionReason ?? null,
    publicId: app.publicId ?? null,
    publicUrl: publicAppUrl(app.publicId),
    trialUpload: (app as any).trialUpload ?? false,
    trialSuspendedAt: (app as any).trialSuspendedAt ? new Date((app as any).trialSuspendedAt).toISOString() : null,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  };
}

function serializeAppSummary(app: any, developerName = "Unknown") {
  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    tagline: app.tagline,
    category: app.category,
    platform: app.platform,
    iconUrl: app.iconUrl,
    rating: app.rating,
    ratingCount: app.ratingCount,
    totalDownloads: app.totalDownloads,
    status: app.status,
    isFeatured: app.isFeatured,
    publishingFeePaid: app.publishingFeePaid ?? false,
    developerName,
    createdAt: app.createdAt.toISOString(),
  };
}

function serializeDev(dev: any) {
  return {
    id: dev.id,
    clerkUserId: dev.clerkUserId,
    displayName: dev.displayName,
    email: dev.email ?? "",
    bio: dev.bio ?? null,
    website: dev.website ?? null,
    company: dev.company ?? null,
    country: dev.country ?? "Nigeria",
    avatarUrl: dev.avatarUrl ?? null,
    status: dev.status,
    feeExempt: dev.feeExempt ?? false,
    /** True once the one-time account fee has been paid (not per-app). */
    registrationFeePaid: dev.registrationFeePaid ?? false,
    /** Clerk user ID occupying the second seat (owner + 1 member = 2 max). */
    memberClerkUserId: dev.memberClerkUserId ?? null,
    paystackCustomerCode: dev.paystackCustomerCode ?? null,
    dedicatedNgnAccount: dev.dedicatedNgnAccount ?? null,
    dedicatedUsdAccount: dev.dedicatedUsdAccount ?? null,
    createdAt: dev.createdAt.toISOString(),
    updatedAt: dev.updatedAt.toISOString(),
  };
}

function isAdmin(req: any): boolean {
  const { userId } = getAuth(req);
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return !!userId && adminIds.includes(userId);
}

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/**
 * Unified admin check: accepts both ADMIN_USER_IDS (by Clerk userId) and
 * SUPER_ADMIN_EMAILS (by primary email — works with any login method, including Google/Gmail).
 * All admin routes must call this instead of isAdmin().
 */
async function checkIsAdmin(req: any): Promise<boolean> {
  if (isAdmin(req)) return true;   // fast path: userId in ADMIN_USER_IDS
  if (SUPER_ADMIN_EMAILS.length === 0) return false;
  const { userId } = getAuth(req);
  if (!userId) return false;
  try {
    const user = await clerkClient.users.getUser(userId);
    const email = (user.primaryEmailAddress?.emailAddress ?? "").toLowerCase();
    return SUPER_ADMIN_EMAILS.includes(email);
  } catch {
    return false;
  }
}

async function isSuperAdmin(req: any): Promise<boolean> {
  // Super admins must pass the general admin check first, then match SUPER_ADMIN_EMAILS
  if (!(await checkIsAdmin(req))) return false;
  if (SUPER_ADMIN_EMAILS.length === 0) return isAdmin(req);
  const { userId } = getAuth(req);
  if (!userId) return false;
  try {
    const user = await clerkClient.users.getUser(userId);
    const email = (user.primaryEmailAddress?.emailAddress ?? "").toLowerCase();
    return SUPER_ADMIN_EMAILS.includes(email);
  } catch {
    return false;
  }
}

async function requireDeveloper(req: any, res: any) {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }

  // Match by owner (clerkUserId) OR second-seat member (memberClerkUserId).
  // This allows both users on a two-seat account to access all developer routes.
  const dev = await db.query.storeDeveloperAccountsTable.findFirst({
    where: or(
      eq(storeDeveloperAccountsTable.clerkUserId, userId),
      eq(storeDeveloperAccountsTable.memberClerkUserId, userId),
    ),
  });

  // Admins can use all developer routes even without a registered developer account.
  // If they also have a developer account, use it; otherwise synthesise a minimal record.
  if (!dev) {
    if (await checkIsAdmin(req)) {
      return { id: 0, clerkUserId: userId, status: "active", displayName: "Admin", email: "", registrationFeePaid: true, feeExempt: true } as any;
    }
    res.status(404).json({ error: "Developer account not found. Register first." });
    return null;
  }
  if (dev.status !== "active" && !(await checkIsAdmin(req))) {
    res.status(403).json({ error: "Developer account is suspended." });
    return null;
  }
  return dev;
}

// ─── Paystack ─────────────────────────────────────────────────────────────────

async function paystackRequest(method: string, path: string, body?: object) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<any>;
}

async function createPaystackCustomer(email: string, firstName: string) {
  try {
    const parts = firstName.split(" ");
    const data = await paystackRequest("POST", "/customer", {
      email, first_name: parts[0] ?? firstName, last_name: parts.slice(1).join(" ") || "",
    });
    return (data?.data?.customer_code as string) ?? null;
  } catch { return null; }
}

async function requestPaystackDedicatedAccount(customerCode: string) {
  try {
    const data = await paystackRequest("POST", "/dedicated_account", {
      customer: customerCode, preferred_bank: "wema-bank",
    });
    if (data?.data?.account_number) {
      return {
        accountNumber: data.data.account_number as string,
        bankName: (data.data.bank?.name as string) ?? "Wema Bank",
        bankSlug: (data.data.bank?.slug as string) ?? "wema-bank",
      };
    }
    return null;
  } catch { return null; }
}

async function initPaystackTransaction(email: string, amountKobo: number, metadata: object, callbackUrl: string) {
  try {
    const data = await paystackRequest("POST", "/transaction/initialize", {
      email, amount: amountKobo, currency: "NGN", metadata, callback_url: callbackUrl,
    });
    return data?.data ?? null;
  } catch { return null; }
}

async function verifyPaystackTransaction(reference: string) {
  try {
    const data = await paystackRequest("GET", `/transaction/verify/${reference}`);
    return data?.data ?? null;
  } catch { return null; }
}

// ─── Interswitch ──────────────────────────────────────────────────────────────

function interswitchHash(txnRef: string, amount: number, redirectUrl: string): string {
  const raw = `${txnRef}${IS_MERCHANT_CODE}${IS_PAY_ITEM_ID}${amount}${redirectUrl}${IS_SECRET_KEY}`;
  return crypto.createHash("sha512").update(raw).digest("hex");
}

function buildInterswitchFormData(txnRef: string, redirectUrl: string, amount = PUBLISHING_FEE_KOBO) {
  const hash = interswitchHash(txnRef, amount, redirectUrl);
  return {
    paymentUrl: "https://webpay.interswitchgroup.com/collections/w/pay",
    formData: {
      merchantCode: IS_MERCHANT_CODE,
      payItemId: IS_PAY_ITEM_ID,
      amount: String(amount),
      siteRedirectUrl: redirectUrl,
      transactionreference: txnRef,
      hash,
      currency: "566",
    },
  };
}

async function verifyInterswitchPayment(txnRef: string, amount = PUBLISHING_FEE_KOBO) {
  try {
    const creds = Buffer.from(`${IS_CLIENT_ID}:${IS_SECRET_KEY}`).toString("base64");
    const url = `https://webpay.interswitchgroup.com/api/v2/purchases/fulfillment?merchantcode=${IS_MERCHANT_CODE}&transactionreference=${encodeURIComponent(txnRef)}&amount=${amount}`;
    const res = await fetch(url, { headers: { Authorization: `Basic ${creds}` } });
    return (await res.json()) as any;
  } catch { return null; }
}

// ─── PUBLIC ROUTES ─────────────────────────────────────────────────────────────

// GET /store/apps
router.get("/apps", async (req, res) => {
  try {
    const { category, platform, search, sort = "newest", page = "1", limit = "24" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(48, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    const conditions: any[] = [eq(storeAppsTable.status, "approved")];
    if (category) conditions.push(eq(storeAppsTable.category, category));
    if (platform && platform !== "all") conditions.push(eq(storeAppsTable.platform, platform));
    if (search) conditions.push(or(ilike(storeAppsTable.name, `%${search}%`), ilike(storeAppsTable.tagline, `%${search}%`))!);
    const orderBy = sort === "rating" ? desc(storeAppsTable.rating)
      : sort === "downloads" ? desc(storeAppsTable.totalDownloads)
      : sort === "trending" ? desc(storeAppsTable.totalDownloads)
      : desc(storeAppsTable.createdAt);
    const [apps, [{ count }]] = await Promise.all([
      db.query.storeAppsTable.findMany({ where: and(...conditions), orderBy, limit: limitNum, offset, with: { developer: true } }),
      db.select({ count: sql<number>`count(*)::int` }).from(storeAppsTable).where(and(...conditions)),
    ]);
    res.json({ apps: apps.map((a) => serializeAppSummary(a, (a as any).developer?.displayName)), total: count, page: pageNum, limit: limitNum });
  } catch (err) {
    logger.error({ err }, "listStoreApps error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/apps/featured
router.get("/apps/featured", async (_req, res) => {
  try {
    const apps = await db.query.storeAppsTable.findMany({
      where: and(eq(storeAppsTable.status, "approved"), eq(storeAppsTable.isFeatured, true)),
      orderBy: desc(storeAppsTable.totalDownloads),
      limit: 10,
      with: { developer: true },
    });
    res.json(apps.map((a) => serializeAppSummary(a, (a as any).developer?.displayName)));
  } catch (err) {
    logger.error({ err }, "featured error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/apps/trending
router.get("/apps/trending", async (_req, res) => {
  try {
    const apps = await db.query.storeAppsTable.findMany({
      where: eq(storeAppsTable.status, "approved"),
      orderBy: desc(storeAppsTable.totalDownloads),
      limit: 12,
      with: { developer: true },
    });
    res.json(apps.map((a) => serializeAppSummary(a, (a as any).developer?.displayName)));
  } catch (err) {
    logger.error({ err }, "trending error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/apps/new-arrivals
router.get("/apps/new-arrivals", async (_req, res) => {
  try {
    const apps = await db.query.storeAppsTable.findMany({
      where: eq(storeAppsTable.status, "approved"),
      orderBy: desc(storeAppsTable.createdAt),
      limit: 12,
      with: { developer: true },
    });
    res.json(apps.map((a) => serializeAppSummary(a, (a as any).developer?.displayName)));
  } catch (err) {
    logger.error({ err }, "new-arrivals error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/apps/categories
router.get("/apps/categories", async (_req, res) => {
  try {
    const counts = await db
      .select({ category: storeAppsTable.category, count: sql<number>`count(*)::int` })
      .from(storeAppsTable)
      .where(eq(storeAppsTable.status, "approved"))
      .groupBy(storeAppsTable.category);
    const countMap = Object.fromEntries(counts.map((r) => [r.category, r.count]));
    res.json(AFRICA_CATEGORIES.map((c) => ({ ...c, count: countMap[c.name] ?? 0 })));
  } catch (err) {
    logger.error({ err }, "categories error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/apps/:slug
router.get("/apps/:slug", async (req, res) => {
  try {
    const app = await db.query.storeAppsTable.findFirst({
      where: and(eq(storeAppsTable.slug, String(req.params.slug)), eq(storeAppsTable.status, "approved")),
      with: { developer: true },
    });
    if (!app) return void res.status(404).json({ error: "App not found" });
    res.json(serializeApp(app, (app as any).developer));
  } catch (err) {
    logger.error({ err }, "getStoreApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/apps/:slug/download — increment counter, log install event, return URL
router.post("/apps/:slug/download", async (req, res) => {
  try {
    const app = await db.query.storeAppsTable.findFirst({
      where: and(eq(storeAppsTable.slug, String(req.params.slug)), eq(storeAppsTable.status, "approved")),
    });
    if (!app) return void res.status(404).json({ error: "App not found" });
    await db.update(storeAppsTable).set({ totalDownloads: app.totalDownloads + 1 }).where(eq(storeAppsTable.id, app.id));
    const authData = getAuth(req);
    logAppEvent(app.id, "install", req, { clerkUserId: authData.userId ?? undefined, sessionId: req.body?.sessionId });
    res.json({ downloadUrl: canonicalDownloadUrl(app), webUrl: app.webUrl ?? null });
  } catch (err) {
    logger.error({ err }, "downloadApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/apps/:slug/subscribe-updates — unauthenticated email opt-in for version notifications
router.post("/apps/:slug/subscribe-updates", async (req: any, res: any) => {
  try {
    const app = await db.query.storeAppsTable.findFirst({
      where: and(eq(storeAppsTable.slug, String(req.params.slug)), eq(storeAppsTable.status, "approved")),
      with: { developer: true },
    });
    if (!app) return void res.status(404).json({ error: "App not found" });

    let email = String(req.body?.email ?? "").trim().toLowerCase();

    // If signed-in user passed the sentinel, resolve their real email from Clerk
    if (email === "__clerk__") {
      const { userId } = getAuth(req);
      if (!userId) return void res.status(401).json({ error: "Not signed in" });
      try {
        const { clerkClient } = await import("@clerk/express");
        const user = await clerkClient.users.getUser(userId);
        email = user.emailAddresses[0]?.emailAddress ?? "";
      } catch { email = ""; }
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return void res.status(400).json({ error: "A valid email address is required" });
    }
    await db.insert(storeAppSubscribersTable)
      .values({ appId: app.id, email })
      .onConflictDoNothing();

    // Add to the developer's CRM (fire-and-forget — never block the response)
    addDownloaderToCrm(app.developer?.clerkUserId ?? null, email, app.name).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "subscribeUpdates error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Unsubscribe token helpers ────────────────────────────────────────────────
function _unsubSecret() {
  return process.env.SESSION_SECRET ?? "awajimaa-store-unsub-dev";
}
function makeUnsubToken(appId: number, email: string): string {
  const emailB64 = Buffer.from(email).toString("base64url");
  const payload = `${appId}:${emailB64}`;
  const sig = crypto.createHmac("sha256", _unsubSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}
function verifyUnsubToken(token: string): { appId: number; email: string } | null {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const payload = token.substring(0, dotIdx);
    const sig = token.substring(dotIdx + 1);
    const expected = crypto.createHmac("sha256", _unsubSecret()).update(payload).digest("hex");
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
    const colonIdx = payload.indexOf(":");
    if (colonIdx < 0) return null;
    const appId = parseInt(payload.substring(0, colonIdx));
    const email = Buffer.from(payload.substring(colonIdx + 1), "base64url").toString();
    if (isNaN(appId) || !email) return null;
    return { appId, email };
  } catch { return null; }
}

/** Send update notification emails to all subscribers of an app. Fire-and-forget. */
async function notifySubscribersOfNewVersion(appId: number, appName: string, appSlug: string, newVersion: string, downloadUrl: string | null) {
  try {
    const subs = await db.select({ email: storeAppSubscribersTable.email })
      .from(storeAppSubscribersTable)
      .where(eq(storeAppSubscribersTable.appId, appId));
    if (!subs.length) return;
    const storeUrl = `https://awajimaaappstore.com/app/${appSlug}`;
    const safeApp = escapeHtml(appName);
    const safeVersion = escapeHtml(newVersion);
    await Promise.allSettled(
      subs.map(({ email }) => {
        const unsubToken = makeUnsubToken(appId, email);
        const unsubUrl = `https://awajimaaappstore.com/unsubscribe?t=${encodeURIComponent(unsubToken)}`;
        const html = wrapVendorEmail({
          bodyHtml: `
            <h2 style="margin:0 0 16px">🆕 ${safeApp} — v${safeVersion} is here</h2>
            <p style="margin:0 0 12px;color:#8892a4">A new version of <strong style="color:#e8eaf0">${safeApp}</strong> you downloaded is now available on the Awajimaa App Store.</p>
            <table style="width:100%;background:#0d1a12;border:1px solid rgba(0,200,83,0.2);border-radius:10px;padding:16px;margin:0 0 20px;border-spacing:0">
              <tr><td style="color:#8892a4;font-size:13px">Version</td><td style="color:#00c853;font-weight:700;font-size:15px">v${safeVersion}</td></tr>
            </table>
            ${downloadUrl ? `<p style="margin:0 0 20px"><a href="${escapeHtml(downloadUrl)}" style="display:inline-block;background:#00c853;color:#000;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px">⬇️ Download v${safeVersion}</a></p>` : ""}
            <p style="margin:0 0 8px"><a href="${escapeHtml(storeUrl)}" style="color:#00c853;font-size:13px">View app page →</a></p>
            <p style="margin:24px 0 0;font-size:11px;color:#4a5568">You received this because you downloaded ${safeApp} from the Awajimaa App Store. <a href="${escapeHtml(unsubUrl)}" style="color:#4a5568">Unsubscribe</a></p>
          `,
        });
        return sendEmail({ to: email, subject: `${appName} v${newVersion} is available — download now`, html });
      })
    );
    logger.info({ appId, count: subs.length }, "notifySubscribers: emails sent");
  } catch (err) {
    logger.error({ err }, "notifySubscribersOfNewVersion error");
  }
}

// DELETE /store/unsubscribe — one-click unsubscribe from app update notifications
router.delete("/unsubscribe", async (req: any, res: any) => {
  try {
    const token = String(req.body?.token ?? "");
    const parsed = verifyUnsubToken(token);
    if (!parsed) return void res.status(400).json({ error: "Invalid or expired unsubscribe link" });

    const app = await db.query.storeAppsTable.findFirst({
      where: eq(storeAppsTable.id, parsed.appId),
    });
    // Delete subscriber row (idempotent — no error if already removed)
    await db.delete(storeAppSubscribersTable)
      .where(and(eq(storeAppSubscribersTable.appId, parsed.appId), eq(storeAppSubscribersTable.email, parsed.email)));

    logger.info({ appId: parsed.appId, email: parsed.email }, "[store-unsub] Subscriber removed");
    res.json({ ok: true, app: app?.name ?? null });
  } catch (err) {
    logger.error({ err }, "unsubscribe error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Upsert the downloader as a CRM lead under the app developer's vendor account.
 * Walk: developerClerkUserId → vendors.clerkUserId → lead upsert + activity.
 * Fire-and-forget — never throws to caller.
 */
async function addDownloaderToCrm(developerClerkUserId: string | null, email: string, appName: string) {
  try {
    if (!developerClerkUserId) return;

    // Resolve the vendor account that owns this developer profile
    const vendor = await db.query.vendorsTable.findFirst({
      where: eq(vendorsTable.clerkUserId, developerClerkUserId),
    });
    if (!vendor) {
      // Developer exists but has no vendor account under the same Clerk identity
      logger.warn({ developerClerkUserId, appName }, "[store-crm] No vendor account found for app developer — downloader not added to CRM. Developer may have registered with a different Clerk account.");
      return;
    }

    // Upsert the lead: find by vendor + email, create if absent
    const existing = await db.query.leadsTable.findFirst({
      where: and(eq(leadsTable.vendorId, vendor.id), eq(leadsTable.email, email)),
    });

    let leadId: number;
    if (existing) {
      leadId = existing.id;
    } else {
      // Derive a display name from the email local-part (e.g. "john.doe" → "John Doe")
      const localPart = email.split("@")[0] ?? "App User";
      const derivedName = localPart.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const [inserted] = await db.insert(leadsTable).values({
        vendorId: vendor.id,
        name: derivedName,
        email,
        channel: "app_store",
        source: "app_store",
        status: "new",
        notes: `Acquired via app store download of "${appName}"`,
      }).returning({ id: leadsTable.id });
      leadId = inserted.id;
    }

    // Record the download as a CRM activity
    await db.insert(personActivitiesTable).values({
      vendorId: vendor.id,
      personId: leadId,
      type: "manual_note",
      data: { note: `Downloaded "${appName}" from Awajimaa App Store` },
    });

    logger.info({ vendorId: vendor.id, leadId, email }, "[store-crm] Downloader added to CRM");
  } catch (err) {
    logger.error({ err }, "[store-crm] addDownloaderToCrm error");
  }
}

// POST /store/apps/:slug/event — public beacon: "view" on page load, "uninstall" when reported
router.post("/apps/:slug/event", async (req, res) => {
  try {
    const { eventType, sessionId } = req.body ?? {};
    if (!["view", "uninstall"].includes(eventType)) return void res.status(400).json({ error: "eventType must be view or uninstall" });
    const app = await db.query.storeAppsTable.findFirst({
      where: and(eq(storeAppsTable.slug, String(req.params.slug)), eq(storeAppsTable.status, "approved")),
    });
    if (!app) return void res.status(404).json({ error: "App not found" });
    const authData = getAuth(req);
    logAppEvent(app.id, eventType, req, { clerkUserId: authData.userId ?? undefined, sessionId });
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "logAppEvent error");
    res.status(204).end(); // never fail the caller
  }
});

// POST /store/users/track — called once per Clerk session; records first-time users + notifies admin
router.post("/users/track", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { email, displayName, country } = req.body ?? {};

    // SELECT first — more robust than relying on ON CONFLICT alone (handles
    // the case where the unique constraint might be absent in production DB).
    const existing = await db
      .select({ id: storeUserSignupsTable.id })
      .from(storeUserSignupsTable)
      .where(eq(storeUserSignupsTable.clerkUserId, userId!))
      .limit(1);

    if (existing.length > 0) {
      // Returning user — send a "Log In" email only to themselves, not admins.
      sendLoginNotification({
        platform: "app-store-user",
        name: displayName ?? "there",
        email: email ?? "",
      });
    } else {
      // Genuinely new user — insert row + notify admins + (they get a welcome from the UI).
      await db.insert(storeUserSignupsTable)
        .values({ clerkUserId: userId!, email: email ?? null, displayName: displayName ?? null, country: country ?? extractCountry(req) })
        .onConflictDoNothing(); // race-safe guard
      notifyAdminSignup({ platform: "app-store-user", name: displayName ?? "App Store User", email: email ?? undefined, country: country ?? undefined });
    }
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "trackStoreUser error");
    res.status(204).end();
  }
});

// GET /store/users/me — authenticated user's installed apps and reviews
router.get("/users/me", requireAuth(), async (req, res): Promise<void> => {
  try {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    // User's signup record (may be null if they signed in via SSO without hitting /users/track yet)
    const userRecord = await db.query.storeUserSignupsTable.findFirst({
      where: eq(storeUserSignupsTable.clerkUserId, userId),
    });

    // Distinct apps this user has installed, most recent install per app
    const installAgg = await db.select({
      appId:       storeAppEventsTable.appId,
      installedAt: sql<string>`max(${storeAppEventsTable.createdAt})::text`,
    })
      .from(storeAppEventsTable)
      .where(and(
        eq(storeAppEventsTable.clerkUserId, userId),
        eq(storeAppEventsTable.eventType, "install"),
      ))
      .groupBy(storeAppEventsTable.appId);

    const appIds = installAgg.map(e => e.appId);
    const installedApps = appIds.length > 0
      ? await db.query.storeAppsTable.findMany({
          where: inArray(storeAppsTable.id, appIds),
          with: { developer: true },
        })
      : [];

    // Attach installedAt and sort most-recent first
    const installedWithDate = installedApps
      .map(app => ({ ...app, installedAt: installAgg.find(e => e.appId === app.id)?.installedAt ?? null }))
      .sort((a, b) => (b.installedAt ?? "").localeCompare(a.installedAt ?? ""));

    // User's own reviews with the app they reviewed
    const reviews = await db.query.storeAppReviewsTable.findMany({
      where: eq(storeAppReviewsTable.reviewerClerkId, userId),
      with: { app: true },
      orderBy: desc(storeAppReviewsTable.createdAt),
      limit: 20,
    });

    res.json({ user: userRecord ?? null, installedApps: installedWithDate, reviews });
  } catch (err) {
    logger.error({ err }, "getStoreUserMe error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/apps/:slug/stats — developer-only per-app event stats
router.get("/apps/:slug/stats", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.slug, String(req.params.slug)) });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({ where: eq(storeDeveloperAccountsTable.clerkUserId, userId!) });
    if (!dev || (dev.id !== app.developerId && !(await checkIsAdmin(req)))) return void res.status(403).json({ error: "Forbidden" });

    const events = await db.select().from(storeAppEventsTable).where(eq(storeAppEventsTable.appId, app.id));
    const byType = (t: string) => events.filter(e => e.eventType === t);
    const countByCountry = (evts: typeof events) => {
      const m: Record<string, number> = {};
      evts.forEach(e => { const c = e.country ?? "Unknown"; m[c] = (m[c] ?? 0) + 1; });
      return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([country, count]) => ({ country, count }));
    };
    const views = byType("view"), installs = byType("install"), uninstalls = byType("uninstall");
    const conversionRate = views.length > 0 ? +(installs.length / views.length * 100).toFixed(1) : 0;

    // Last 30 days daily breakdown
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 29);
    const recentEvents = events.filter(e => new Date(e.createdAt) >= cutoff);
    const byDay: Record<string, { views: number; installs: number; uninstalls: number }> = {};
    recentEvents.forEach(e => {
      const day = e.createdAt.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { views: 0, installs: 0, uninstalls: 0 };
      if (e.eventType === "view") byDay[day]!.views++;
      if (e.eventType === "install") byDay[day]!.installs++;
      if (e.eventType === "uninstall") byDay[day]!.uninstalls++;
    });

    res.json({
      totalViews: views.length,
      totalInstalls: app.totalDownloads,
      totalUninstalls: uninstalls.length,
      conversionRate,
      viewsByCountry: countByCountry(views),
      installsByCountry: countByCountry(installs),
      daily: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({ date, ...d })),
    });
  } catch (err) {
    logger.error({ err }, "appStats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/admin/event-analytics — admin overview of all store events
router.get("/admin/event-analytics", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const days = parseInt(String(req.query.days ?? "30"), 10) || 30;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);

    const [events, newUsers, apps] = await Promise.all([
      db.select().from(storeAppEventsTable).where(gte(storeAppEventsTable.createdAt, cutoff)),
      db.select().from(storeUserSignupsTable).where(gte(storeUserSignupsTable.createdAt, cutoff)),
      db.select({ id: storeAppsTable.id, name: storeAppsTable.name, totalDownloads: storeAppsTable.totalDownloads }).from(storeAppsTable),
    ]);

    const byType = (t: string) => events.filter(e => e.eventType === t);
    const views = byType("view"), installs = byType("install"), uninstalls = byType("uninstall");

    const countByCountry = (evts: typeof events) => {
      const m: Record<string, number> = {};
      evts.forEach(e => { const c = e.country ?? "Unknown"; m[c] = (m[c] ?? 0) + 1; });
      return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([country, count]) => ({ country, count }));
    };

    const byDay: Record<string, { views: number; installs: number; uninstalls: number; newUsers: number }> = {};
    const addDay = (day: string) => { if (!byDay[day]) byDay[day] = { views: 0, installs: 0, uninstalls: 0, newUsers: 0 }; };
    events.forEach(e => {
      const day = e.createdAt.toISOString().slice(0, 10); addDay(day);
      if (e.eventType === "view") byDay[day]!.views++;
      if (e.eventType === "install") byDay[day]!.installs++;
      if (e.eventType === "uninstall") byDay[day]!.uninstalls++;
    });
    newUsers.forEach(u => {
      const day = u.createdAt.toISOString().slice(0, 10); addDay(day);
      byDay[day]!.newUsers++;
    });

    const appIdMap: Record<number, string> = {};
    apps.forEach(a => { appIdMap[a.id] = a.name; });
    const installsByApp: Record<string, number> = {};
    installs.forEach(e => { const n = appIdMap[e.appId] ?? "Unknown"; installsByApp[n] = (installsByApp[n] ?? 0) + 1; });
    const viewsByApp: Record<string, number> = {};
    views.forEach(e => { const n = appIdMap[e.appId] ?? "Unknown"; viewsByApp[n] = (viewsByApp[n] ?? 0) + 1; });
    const uninstallsByApp: Record<string, number> = {};
    uninstalls.forEach(e => { const n = appIdMap[e.appId] ?? "Unknown"; uninstallsByApp[n] = (uninstallsByApp[n] ?? 0) + 1; });

    // Region (state/province) breakdown — only available when CF headers are present
    const countByRegion = (evts: typeof events) => {
      const m: Record<string, number> = {};
      evts.forEach(e => {
        const r = (e as any).region as string | null | undefined;
        if (r) { m[r] = (m[r] ?? 0) + 1; }
      });
      return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([region, count]) => ({ region, count }));
    };
    const countByCity = (evts: typeof events) => {
      const m: Record<string, number> = {};
      evts.forEach(e => {
        const c = (e as any).city as string | null | undefined;
        if (c) { m[c] = (m[c] ?? 0) + 1; }
      });
      return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([city, count]) => ({ city, count }));
    };

    // Review stats across all apps
    const reviews = await db.select().from(storeAppReviewsTable).where(gte(storeAppReviewsTable.createdAt, cutoff));
    const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => { if (r.rating >= 1 && r.rating <= 5) ratingDist[r.rating] = (ratingDist[r.rating] ?? 0) + 1; });
    const avgRating = reviews.length > 0 ? +(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(2) : 0;
    const reviewsByApp: Record<string, { count: number; avgRating: number; total: number }> = {};
    reviews.forEach(r => {
      const n = appIdMap[r.appId] ?? "Unknown";
      const e = reviewsByApp[n] ?? { count: 0, avgRating: 0, total: 0 };
      e.count++; e.total += r.rating;
      reviewsByApp[n] = e;
    });
    const topReviewedApps = Object.entries(reviewsByApp)
      .map(([name, d]) => ({ name, count: d.count, avgRating: +(d.total / d.count).toFixed(2) }))
      .sort((a, b) => b.count - a.count).slice(0, 10);

    res.json({
      period: days,
      totalViews: views.length,
      totalInstalls: installs.length,
      totalUninstalls: uninstalls.length,
      totalNewUsers: newUsers.length,
      totalReviews: reviews.length,
      avgRating,
      conversionRate: views.length > 0 ? +(installs.length / views.length * 100).toFixed(1) : 0,
      viewsByCountry: countByCountry(views),
      installsByCountry: countByCountry(installs),
      uninstallsByCountry: countByCountry(uninstalls),
      newUsersByCountry: countByCountry(newUsers.map(u => ({ id: 0, appId: 0, eventType: "signup", sessionId: null, clerkUserId: u.clerkUserId, country: u.country, region: null, city: null, userAgent: null, createdAt: u.createdAt }))),
      viewsByRegion: countByRegion(views),
      installsByRegion: countByRegion(installs),
      viewsByCity: countByCity(views),
      installsByCity: countByCity(installs),
      topAppsByInstalls: Object.entries(installsByApp).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
      topAppsByViews: Object.entries(viewsByApp).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
      topAppsByUninstalls: Object.entries(uninstallsByApp).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
      topReviewedApps,
      ratingDistribution: Object.entries(ratingDist).map(([stars, count]) => ({ stars: Number(stars), count })),
      daily: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({ date, ...d })),
    });
  } catch (err) {
    logger.error({ err }, "eventAnalytics error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/apps/:slug/reviews
router.get("/apps/:slug/reviews", async (req, res) => {
  try {
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.slug, String(req.params.slug)) });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const reviews = await db.query.storeAppReviewsTable.findMany({
      where: and(eq(storeAppReviewsTable.appId, app.id), eq(storeAppReviewsTable.isFlagged, false)),
      orderBy: desc(storeAppReviewsTable.createdAt),
      limit: 50,
    });
    res.json(reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch (err) {
    logger.error({ err }, "listReviews error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/apps/:slug/reviews
router.post("/apps/:slug/reviews", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { rating, comment, reviewerName } = req.body;
    if (!rating || rating < 1 || rating > 5) return void res.status(400).json({ error: "Rating 1–5 required" });
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.slug, String(req.params.slug)) });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const existing = await db.query.storeAppReviewsTable.findFirst({
      where: and(eq(storeAppReviewsTable.appId, app.id), eq(storeAppReviewsTable.reviewerClerkId, userId!)),
    });
    if (existing) return void res.status(409).json({ error: "You already reviewed this app" });
    const sentimentLabel = rating >= 4 ? "positive" : rating <= 2 ? "negative" : "neutral";
    const sentimentScore = rating >= 4 ? 0.7 : rating <= 2 ? -0.7 : 0;
    const [review] = await db.insert(storeAppReviewsTable).values({
      appId: app.id,
      reviewerClerkId: userId!,
      reviewerName: reviewerName ?? "User",
      rating,
      comment: comment ?? null,
      sentimentLabel,
      sentimentScore,
    }).returning();
    const allReviews = await db.select({ rating: storeAppReviewsTable.rating }).from(storeAppReviewsTable).where(eq(storeAppReviewsTable.appId, app.id));
    const avg = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
    await db.update(storeAppsTable).set({ rating: Math.round(avg * 10) / 10, ratingCount: allReviews.length }).where(eq(storeAppsTable.id, app.id));
    res.status(201).json({ ...review, createdAt: review.createdAt.toISOString() });
  } catch (err) {
    logger.error({ err }, "submitReview error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/apps/:slug/versions — public: live + deprecated only
router.get("/apps/:slug/versions", async (req, res) => {
  try {
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.slug, String(req.params.slug)) });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const versions = await db.query.storeAppVersionsTable.findMany({
      where: and(eq(storeAppVersionsTable.appId, app.id), sql`status IN ('live','deprecated')`),
      orderBy: desc(storeAppVersionsTable.createdAt),
    });
    res.json(versions.map(serializeVersion));
  } catch (err) {
    logger.error({ err }, "listVersions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── CANONICAL DOWNLOAD ROUTES ────────────────────────────────────────────────
// GET /store/dl/:identifier          → latest live version (by packageName or slug)
// GET /store/dl/:identifier/:version → a specific version
// These are permanent, shareable links that always resolve to the right file.

router.get("/dl/:identifier", async (req: any, res: any) => {
  try {
    const id = decodeURIComponent(String(req.params.identifier));
    const app = await db.query.storeAppsTable.findFirst({
      where: or(eq((storeAppsTable as any).packageName, id), eq(storeAppsTable.slug, id)),
    });
    if (!app || app.status !== "approved") return void res.status(404).json({ error: "App not found" });

    const liveVer = await db.query.storeAppVersionsTable.findFirst({
      where: and(eq(storeAppVersionsTable.appId, app.id), eq(storeAppVersionsTable.status, "live")),
    });
    const fileUrl = liveVer?.fileUrl ?? app.downloadUrl;
    if (!fileUrl) return void res.status(404).json({ error: "No download available for this app yet" });

    await db.update(storeAppsTable).set({ totalDownloads: sql`${storeAppsTable.totalDownloads} + 1` }).where(eq(storeAppsTable.id, app.id));
    logAppEvent(app.id, "download", req);
    res.redirect(302, fileUrl);
  } catch (err) {
    logger.error({ err }, "dl:identifier error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dl/:identifier/:version", async (req: any, res: any) => {
  try {
    const id = decodeURIComponent(String(req.params.identifier));
    const ver = String(req.params.version);
    const app = await db.query.storeAppsTable.findFirst({
      where: or(eq((storeAppsTable as any).packageName, id), eq(storeAppsTable.slug, id)),
    });
    if (!app || app.status !== "approved") return void res.status(404).json({ error: "App not found" });

    const version = await db.query.storeAppVersionsTable.findFirst({
      where: and(eq(storeAppVersionsTable.appId, app.id), eq(storeAppVersionsTable.version, ver)),
    });
    if (!version?.fileUrl) return void res.status(404).json({ error: `Version ${ver} not found or has no file` });

    logAppEvent(app.id, "download", req);
    res.redirect(302, version.fileUrl);
  } catch (err) {
    logger.error({ err }, "dl:identifier:version error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DEVELOPER ROUTES ──────────────────────────────────────────────────────────

// GET /store/developers/me
router.get("/developers/me", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.clerkUserId, userId!),
    });
    if (!dev) return void res.status(404).json({ error: "Not registered as a developer" });
    const [{ totalApps }] = await db.select({ totalApps: sql<number>`count(*)::int` }).from(storeAppsTable).where(eq(storeAppsTable.developerId, dev.id));
    const [{ totalDownloads }] = await db.select({ totalDownloads: sql<number>`coalesce(sum(total_downloads),0)::int` }).from(storeAppsTable).where(eq(storeAppsTable.developerId, dev.id));
    res.json({ ...serializeDev(dev), totalApps, totalDownloads });
  } catch (err) {
    logger.error({ err }, "getMe error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/apps/upload-url — presigned direct-to-storage URL for any app file
// The browser PUTs the file directly to `uploadUrl` (bypasses the API server + proxy
// entirely, so there is no body-size limit). The caller then uses `fileUrl` as the
// permanent public download / icon / screenshot link.
router.post("/apps/upload-url", requireAuth(), async (req: any, res: any) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;

    const _obj = new ObjectStorageService();
    const uploadUrl = await _obj.getObjectEntityUploadURL();
    const objectPath = _obj.normalizeObjectEntityPath(uploadUrl);
    await _obj.trySetObjectEntityAclPolicy(objectPath, { owner: "system:store-app", visibility: "public" }).catch(() => {/* best-effort */});

    const objectId = objectPath.replace(/^\/objects\/uploads\//, "");
    const domain = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN;
    if (!domain) { res.status(500).json({ error: "No public domain configured" }); return; }

    const fileUrl = `https://${domain}/api/media/${objectId}`;
    res.json({ uploadUrl, fileUrl });
  } catch (err) {
    logger.error({ err }, "store/apps/upload-url error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/apps/finalize-media — mirror a Replit presigned-storage upload to GCS.
// The browser PUTs its file to the Replit presigned URL (no size limit, no API proxy),
// then calls this endpoint with the Replit URL to get a permanent GCS URL back.
// Non-fatal: returns { gcsUrl: null } when GCS is not configured or the mirror fails,
// so the caller can fall back to the original Replit URL.
router.post("/apps/finalize-media", requireAuth(), async (req: any, res: any) => {
  try {
    const { replitUrl } = req.body as { replitUrl?: string };
    if (!replitUrl || typeof replitUrl !== "string") {
      return void res.status(400).json({ error: "replitUrl required" });
    }
    if (!isR2Configured()) {
      return void res.json({ gcsUrl: null });
    }
    const gcsUrl = await mirrorUrlToR2(replitUrl, undefined, "app-store/media");
    res.json({ gcsUrl });
  } catch (err) {
    logger.warn({ err }, "finalize-media: GCS mirror failed — falling back to Replit URL");
    res.json({ gcsUrl: null }); // non-fatal
  }
});

// POST /store/developers/register — FREE registration + auto dedicated account
router.post("/developers/register", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { displayName, email, bio, website, company, country } = req.body;
    if (!displayName || !email) return void res.status(400).json({ error: "displayName and email are required" });

    const existing = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.clerkUserId, userId!),
    });
    if (existing) return void res.status(409).json({ error: "Already registered as a developer" });

    // Create Paystack customer for dedicated NGN account
    const customerCode = await createPaystackCustomer(email, displayName);
    let dedicatedNgnAccount: any = null;
    if (customerCode) {
      dedicatedNgnAccount = await requestPaystackDedicatedAccount(customerCode);
    }

    const isFeeExempt = SUPER_ADMIN_EMAILS.includes(email.toLowerCase().trim());
    const [dev] = await db.insert(storeDeveloperAccountsTable).values({
      clerkUserId: userId!,
      displayName,
      email,
      bio: bio ?? null,
      website: website ?? null,
      company: company ?? null,
      country: country ?? "Nigeria",
      status: "active",
      feeExempt: isFeeExempt,
      // Fee-exempt accounts (super-admins) are pre-activated; everyone else pays once.
      registrationFeePaid: isFeeExempt,
      paystackCustomerCode: customerCode ?? null,
      dedicatedNgnAccount: dedicatedNgnAccount,
    } as any).returning();

    res.status(201).json({ ...serializeDev(dev), totalApps: 0, totalDownloads: 0 });
    notifyAdminSignup({ platform: "app-store", name: displayName, email });

    // Auto-create a Vendor Hub account using the same Clerk identity so the developer
    // can log into both platforms with one set of credentials.
    void db.insert(vendorsTable).values({
      clerkUserId:    userId!,
      name:           displayName,
      email,
      country:        country ?? "Nigeria",
      industry:       "General",
      externalSource: "appstore",
    } as any).onConflictDoNothing();
  } catch (err) {
    logger.error({ err }, "registerDeveloper error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /store/developers/me
router.patch("/developers/me", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({ where: eq(storeDeveloperAccountsTable.clerkUserId, userId!) });
    if (!dev) return void res.status(404).json({ error: "Not found" });
    const { displayName, bio, website, company, avatarUrl, country } = req.body;
    const [updated] = await db.update(storeDeveloperAccountsTable)
      .set({ displayName: displayName ?? dev.displayName, bio: bio ?? dev.bio, website: website ?? dev.website, company: company ?? dev.company, avatarUrl: avatarUrl ?? dev.avatarUrl, country: country ?? dev.country, updatedAt: new Date() })
      .where(eq(storeDeveloperAccountsTable.id, dev.id)).returning();
    res.json({ ...serializeDev(updated), totalApps: 0, totalDownloads: 0 });
  } catch (err) {
    logger.error({ err }, "updateMe error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/developers/me/dashboard
router.get("/developers/me/dashboard", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({ where: eq(storeDeveloperAccountsTable.clerkUserId, userId!) });
    if (!dev) return void res.status(404).json({ error: "Not found" });
    const apps = await db.query.storeAppsTable.findMany({ where: eq(storeAppsTable.developerId, dev.id) });
    const totalDownloads = apps.reduce((s, a) => s + a.totalDownloads, 0);
    res.json({
      totalApps: apps.length,
      totalDownloads,
      pendingPayment: apps.filter((a) => a.status === "pending_payment").length,
      pendingReview: apps.filter((a) => a.status === "pending_review").length,
      approved: apps.filter((a) => a.status === "approved").length,
      rejected: apps.filter((a) => a.status === "rejected").length,
      appBreakdown: apps.map((a) => ({
        appId: a.id, appName: a.name, slug: a.slug,
        downloads: a.totalDownloads, rating: a.rating, ratingCount: a.ratingCount,
        status: a.status, publishingFeePaid: a.publishingFeePaid, isFeatured: a.isFeatured,
      })),
    });
  } catch (err) {
    logger.error({ err }, "dashboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/developers/me/apps
router.get("/developers/me/apps", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({ where: eq(storeDeveloperAccountsTable.clerkUserId, userId!) });
    if (!dev) return void res.status(404).json({ error: "Not found" });
    const apps = await db.query.storeAppsTable.findMany({ where: eq(storeAppsTable.developerId, dev.id), orderBy: desc(storeAppsTable.createdAt) });
    res.json(apps.map((a) => serializeApp(a, dev)));
  } catch (err) {
    logger.error({ err }, "myApps error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/developers/me/apps — submit new app (downloadUrl required)
router.post("/developers/me/apps", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const { name, tagline, description, categories: rawCategories, category: singleCategory, platform, iconUrl, screenshots, downloadUrl, webUrl, currentVersion, packageName } = req.body;
    // Accept either a `categories` array (new) or a legacy `category` string
    const categories: string[] = Array.isArray(rawCategories) && rawCategories.length > 0
      ? rawCategories.slice(0, 5).filter(Boolean)
      : singleCategory ? [String(singleCategory)] : [];
    const category = categories[0] ?? null;
    if (!name || !tagline || !description || !category || !platform || !iconUrl) {
      return void res.status(400).json({ error: "name, tagline, description, at least one category, platform, iconUrl are required" });
    }
    if (!downloadUrl) return void res.status(400).json({ error: "downloadUrl is required — every app must have a direct download or install link" });

    // AAB files require Google Play infrastructure and cannot be installed directly by users.
    const { fileName } = req.body as { fileName?: string };
    if (fileName && fileName.toLowerCase().endsWith(".aab")) {
      return void res.status(400).json({
        error: "AAB files are not accepted. AAB is a Google Play publishing format and cannot be directly installed by users. Please upload an APK instead.",
        code: "AAB_NOT_SUPPORTED",
      });
    }

    // Package name uniqueness check (optional but must be unique if provided)
    if (packageName) {
      const pkgConflict = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.packageName, packageName) } as any);
      if (pkgConflict) return void res.status(409).json({ error: `Package name "${packageName}" is already registered to another app.` });
    }

    let slug = slugify(name);
    const existing = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.slug, slug) });
    if (existing) slug = `${slug}-${Date.now()}`;

    const isFeeExempt = (dev as any).feeExempt === true;
    const isAccountFeePaid = isFeeExempt || (dev as any).registrationFeePaid === true;
    const clerkUserId = (req as any).auth?.userId;

    // Gate: the developer must have completed the one-time account fee before submitting.
    // Upload trials are an exception (admin-granted window for testing).
    let isTrialUpload = false;
    if (!isAccountFeePaid) {
      const now = new Date();
      const activeTrial = await db.query.storeUploadTrialsTable.findFirst({
        where: and(
          eq(storeUploadTrialsTable.developerId, dev.id),
          isNull(storeUploadTrialsTable.revokedAt),
          gte(storeUploadTrialsTable.expiresAt, now),
        ),
      });
      isTrialUpload = activeTrial != null;

      if (!isTrialUpload) {
        return void res.status(402).json({
          error: "Developer account payment required",
          message: "Complete your one-time developer account payment before submitting apps.",
          code: "ACCOUNT_FEE_UNPAID",
        });
      }
    }

    const [app] = await db.insert(storeAppsTable).values({
      developerId: dev.id,
      name, slug, tagline, description, category, categories, platform, iconUrl,
      screenshots: screenshots ?? [],
      downloadUrl,
      webUrl: webUrl ?? null,
      currentVersion: currentVersion ?? null,
      packageName: packageName ?? null,
      publicId: generatePublicId(clerkUserId),
      // Account fee already paid → go straight to review. Trial uploads are flagged for later.
      status: "pending_review",
      publishingFeePaid: true,
      trialUpload: isTrialUpload,
      publishingFeeAmountKobo: 0,
    } as any).returning();
    res.status(201).json(serializeApp(app, dev));

    // ── Submission confirmation email — best-effort, never blocks the response ──
    if (dev.email) {
      const STORE = "https://awajimaaappstore.com";
      const html = wrapVendorEmail({
        bodyHtml: `
          <h1 style="text-align:center;font-size:20px;color:#1a1a1a;margin:0 0 16px;">
            App received! 📱
          </h1>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            Hi ${escapeHtml(dev.displayName ?? "there")},
          </p>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            We've received your submission for <strong>${escapeHtml(name)}</strong>.
            Our team will review it and get back to you shortly.
          </p>
          <table style="width:100%;font-size:13px;color:#444;border-collapse:collapse;margin:16px 0;">
            <tr>
              <td style="padding:6px 0;color:#888;width:120px;">Platform</td>
              <td style="padding:6px 0;font-weight:600;text-transform:capitalize;">${escapeHtml(platform)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#888;">Category</td>
              <td style="padding:6px 0;font-weight:600;">${escapeHtml(category)}</td>
            </tr>
            ${currentVersion ? `<tr>
              <td style="padding:6px 0;color:#888;">Version</td>
              <td style="padding:6px 0;font-weight:600;">${escapeHtml(String(currentVersion))}</td>
            </tr>` : ""}
            <tr>
              <td style="padding:6px 0;color:#888;vertical-align:top;">Download link</td>
              <td style="padding:6px 0;word-break:break-all;">
                <a href="${escapeHtml(downloadUrl)}" style="color:#00c853;">${escapeHtml(downloadUrl)}</a>
              </td>
            </tr>
          </table>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            Track your submission and respond to any reviewer feedback in your
            <a href="${STORE}/app-store/developer" style="color:#00c853;">Developer Portal</a>.
            We'll email you as soon as a decision is made.
          </p>
        `,
      });
      sendEmail({
        to: dev.email,
        subject: `Your app "${name}" has been submitted to the Awajimaa App Store`,
        html,
      }).catch(() => {/* best-effort */});
    }
  } catch (err) {
    logger.error({ err }, "submitApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /store/developers/me/apps/:id
router.patch("/developers/me/apps/:id", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const appId = parseInt(String(req.params.id));
    const app = await db.query.storeAppsTable.findFirst({ where: and(eq(storeAppsTable.id, appId), eq(storeAppsTable.developerId, dev.id)) });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const { tagline, description, categories: rawCategories, category: singleCategory, platform, iconUrl, screenshots, downloadUrl, webUrl, currentVersion } = req.body;
    const newCats: string[] | undefined = Array.isArray(rawCategories) && rawCategories.length > 0
      ? rawCategories.slice(0, 5).filter(Boolean)
      : singleCategory ? [String(singleCategory)] : undefined;
    const newCategory = newCats ? newCats[0] : undefined;
    const [updated] = await db.update(storeAppsTable).set({
      tagline: tagline ?? app.tagline,
      description: description ?? app.description,
      category: newCategory ?? app.category,
      ...(newCats ? { categories: newCats } : {}),
      platform: platform ?? app.platform,
      iconUrl: iconUrl ?? app.iconUrl,
      screenshots: screenshots ?? app.screenshots,
      downloadUrl: downloadUrl ?? app.downloadUrl,
      webUrl: webUrl ?? app.webUrl,
      currentVersion: currentVersion ?? app.currentVersion,
      updatedAt: new Date(),
    }).where(eq(storeAppsTable.id, appId)).returning();
    res.json(serializeApp(updated, dev));

    // ── Notify admins if the download URL changed on a live/approved app (fire-and-forget) ──
    const urlChanged = downloadUrl && downloadUrl !== app.downloadUrl;
    const isApproved = (app as any).status === "approved";
    if (urlChanged && isApproved) {
      const adminEmails = (process.env.SUPER_ADMIN_EMAILS ?? "Lumgwunsolutions@gmail.com")
        .split(",").map((s) => s.trim()).filter(Boolean);
      sendEmail({
        to: adminEmails.join(", "),
        subject: `[App Store] Download URL updated for "${app.name}"`,
        html: wrapVendorEmail({
          bodyHtml: `
            <h1 style="text-align:center;font-size:18px;color:#1a1a1a;margin:0 0 16px;">🔗 App Download URL Changed</h1>
            <p style="font-size:14px;line-height:1.6;color:#444;">
              <strong>${escapeHtml(dev.displayName ?? "A developer")}</strong> updated the download link for
              <strong>${escapeHtml(app.name)}</strong>.
            </p>
            <table style="width:100%;font-size:13px;color:#444;border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:6px 0;color:#888;width:80px;">Old URL</td><td style="padding:6px 0;word-break:break-all;">${escapeHtml(String(app.downloadUrl ?? ""))}</td></tr>
              <tr><td style="padding:6px 0;color:#888;">New URL</td><td style="padding:6px 0;word-break:break-all;"><a href="${escapeHtml(downloadUrl)}" style="color:#00c853;">${escapeHtml(downloadUrl)}</a></td></tr>
              ${currentVersion ? `<tr><td style="padding:6px 0;color:#888;">Version</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(String(currentVersion))}</td></tr>` : ""}
            </table>
            <p style="font-size:13px;color:#888;">The new URL is live immediately. Verify it's safe before users download it.</p>`,
        }),
      }).catch(() => {});
      sendSlackAlert(`🔗 *App Download URL Changed*\nApp: *${app.name}* | Developer: ${dev.displayName ?? "unknown"}\nNew URL: ${downloadUrl}`).catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, "updateApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /store/developers/me/apps/:id
router.delete("/developers/me/apps/:id", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const appId = parseInt(String(req.params.id));
    const app = await db.query.storeAppsTable.findFirst({ where: and(eq(storeAppsTable.id, appId), eq(storeAppsTable.developerId, dev.id)) });
    if (!app) return void res.status(404).json({ error: "Not found" });
    await db.delete(storeAppsTable).where(eq(storeAppsTable.id, appId));
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "deleteApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/developers/me/apps/:id/versions
router.post("/developers/me/apps/:id/versions", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const appId = parseInt(String(req.params.id));
    const app = await db.query.storeAppsTable.findFirst({ where: and(eq(storeAppsTable.id, appId), eq(storeAppsTable.developerId, dev.id)) });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const { version, releaseNotes, downloadUrl } = req.body;
    if (!version) return void res.status(400).json({ error: "version is required" });
    const [v] = await db.insert(storeAppVersionsTable).values({
      appId,
      version,
      releaseNotes: releaseNotes ?? null,
      fileUrl: downloadUrl ?? null,
      // status defaults to 'pending' — admin must activate via /admin/apps/:id/versions/:versionId/activate
    }).returning();
    res.status(201).json({ ...v, createdAt: v.createdAt.toISOString() });

    // ── Notify admins that a new version is pending activation (fire-and-forget) ──
    const adminEmails = (process.env.SUPER_ADMIN_EMAILS ?? "Lumgwunsolutions@gmail.com")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const STORE_ADMIN = "https://awajimaaappstore.com/app-store/admin";
    const notifyHtml = wrapVendorEmail({
      bodyHtml: `
        <h1 style="text-align:center;font-size:18px;color:#1a1a1a;margin:0 0 16px;">📦 New App Version Pending</h1>
        <p style="font-size:14px;line-height:1.6;color:#444;">
          <strong>${escapeHtml(dev.displayName ?? "A developer")}</strong> submitted a new version of
          <strong>${escapeHtml(app.name)}</strong> that needs your review before it goes live.
        </p>
        <table style="width:100%;font-size:13px;color:#444;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 0;color:#888;width:120px;">App</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(app.name)}</td></tr>
          <tr><td style="padding:6px 0;color:#888;">Version</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(version)}</td></tr>
          ${releaseNotes ? `<tr><td style="padding:6px 0;color:#888;vertical-align:top;">Notes</td><td style="padding:6px 0;">${escapeHtml(releaseNotes)}</td></tr>` : ""}
          ${downloadUrl ? `<tr><td style="padding:6px 0;color:#888;vertical-align:top;">Download</td><td style="padding:6px 0;word-break:break-all;"><a href="${escapeHtml(downloadUrl)}" style="color:#00c853;">${escapeHtml(downloadUrl)}</a></td></tr>` : ""}
        </table>
        <p style="font-size:14px;color:#444;">
          Go to the <a href="${STORE_ADMIN}" style="color:#00c853;">Admin Panel → Apps → Versions</a> to activate this version.
        </p>`,
    });
    sendEmail({
      to: adminEmails.join(", "),
      subject: `[App Store] New version v${version} pending for "${app.name}"`,
      html: notifyHtml,
    }).catch(() => {});
    sendSlackAlert(`📦 *New App Version Pending*\nApp: *${app.name}* | Version: *v${version}* by ${dev.displayName ?? "developer"}\nActivate it in the Admin Panel: ${STORE_ADMIN}`).catch(() => {});
  } catch (err) {
    logger.error({ err }, "addVersion error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PAYMENT ROUTES ─────────────────────────────────────────────────────────────

// POST /store/payments/initiate — NGN 50,000 (African devs) or $100 USD (non-African devs)
router.post("/payments/initiate", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { appId, gateway } = req.body;
    if (!appId || !gateway) return void res.status(400).json({ error: "appId and gateway are required" });

    const dev = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.clerkUserId, userId!),
    });
    if (!dev) return void res.status(404).json({ error: "Developer account not found" });

    const app = await db.query.storeAppsTable.findFirst({
      where: and(eq(storeAppsTable.id, parseInt(appId)), eq(storeAppsTable.developerId, dev.id)),
    });
    if (!app) return void res.status(404).json({ error: "App not found" });
    if (app.publishingFeePaid) return void res.status(400).json({ error: "Publishing fee already paid for this app" });

    const baseUrl = getBaseUrl(req);
    const african = isAfricanCountry(dev.country);

    // ── African developers (NGN) ─────────────────────────────────────────────
    if (african) {
      if (gateway === "paystack") {
        const callbackUrl = `${baseUrl}/app-store/developer?payment=paystack&appId=${app.id}`;
        const txn = await initPaystackTransaction(
          dev.email || `dev${dev.id}@africaappstore.com`,
          PUBLISHING_FEE_KOBO,
          { purpose: "africa_store_publishing_fee", appId: app.id, developerId: dev.id, appName: app.name },
          callbackUrl,
        );
        if (!txn) return void res.status(500).json({ error: "Could not initialize Paystack payment" });
        await db.update(storeAppsTable)
          .set({ publishingFeeRef: txn.reference, publishingFeeGateway: "paystack", publishingFeeAmountKobo: PUBLISHING_FEE_KOBO, updatedAt: new Date() } as any)
          .where(eq(storeAppsTable.id, app.id));
        return void res.json({ gateway: "paystack", authorizationUrl: txn.authorization_url, reference: txn.reference });

      } else if (gateway === "interswitch") {
        const txnRef = `AFST-${app.id}-${Date.now()}`;
        const redirectUrl = `${baseUrl}/api/store/payments/interswitch/callback`;
        const { paymentUrl, formData } = buildInterswitchFormData(txnRef, redirectUrl);
        await db.update(storeAppsTable)
          .set({ publishingFeeRef: txnRef, publishingFeeGateway: "interswitch", publishingFeeAmountKobo: PUBLISHING_FEE_KOBO, updatedAt: new Date() } as any)
          .where(eq(storeAppsTable.id, app.id));
        return void res.json({ gateway: "interswitch", paymentUrl, formData, appId: app.id });

      } else {
        return void res.status(400).json({ error: "For African developers, gateway must be 'paystack' or 'interswitch'" });
      }

    // ── Non-African developers (USD) ─────────────────────────────────────────
    } else {
      if (gateway === "squad") {
        const squadKey = await resolveSquadKey();
        const txnRef = `AFST-USD-${app.id}-${Date.now()}`;
        const callbackUrl = `${baseUrl}/api/store/payments/squad/callback`;
        const result = await squadInitiatePayment(squadKey, {
          email: dev.email || `dev${dev.id}@africaappstore.com`,
          amount: PUBLISHING_FEE_USD_CENTS,
          currency: "USD",
          initiateType: "redirect",
          callbackUrl,
          transactionRef: txnRef,
          customerName: dev.displayName ?? undefined,
          metadata: { purpose: "africa_store_publishing_fee", appId: app.id, developerId: dev.id, appName: app.name },
        });
        await db.update(storeAppsTable)
          .set({ publishingFeeRef: txnRef, publishingFeeGateway: "squad", publishingFeeAmountKobo: PUBLISHING_FEE_USD_CENTS, updatedAt: new Date() } as any)
          .where(eq(storeAppsTable.id, app.id));
        return void res.json({ gateway: "squad", checkoutUrl: result.data.checkout_url, transactionRef: txnRef });

      } else if (gateway === "stripe") {
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) return void res.status(503).json({ error: "Stripe is not configured on this platform" });
        const stripe = new Stripe(stripeKey);
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          customer_email: dev.email ?? undefined,
          line_items: [{
            price_data: {
              currency: "usd",
              product_data: { name: `Africa App Store — Publishing Fee: ${app.name}` },
              unit_amount: PUBLISHING_FEE_USD_CENTS,
            },
            quantity: 1,
          }],
          metadata: { purpose: "africa_store_publishing_fee", appId: String(app.id), developerId: String(dev.id), appName: app.name },
          success_url: `${baseUrl}/app-store/developer?payment=stripe&appId=${app.id}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/app-store/developer?payment=stripe&status=cancelled`,
        });
        await db.update(storeAppsTable)
          .set({ publishingFeeRef: session.id, publishingFeeGateway: "stripe", publishingFeeAmountKobo: PUBLISHING_FEE_USD_CENTS, updatedAt: new Date() } as any)
          .where(eq(storeAppsTable.id, app.id));
        return void res.json({ gateway: "stripe", checkoutUrl: session.url!, sessionId: session.id });

      } else {
        return void res.status(400).json({ error: "For non-African developers, gateway must be 'squad' or 'stripe'" });
      }
    }
  } catch (err: any) {
    logger.error({ err }, "initiatePayment error");
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

// POST /store/payments/squad/verify — client-side confirmation after Squad redirect
router.post("/payments/squad/verify", requireAuth(), async (req, res) => {
  try {
    const { transactionRef } = req.body;
    if (!transactionRef) return void res.status(400).json({ error: "transactionRef required" });
    const squadKey = await resolveSquadKey();
    const result = await squadVerifyTransaction(squadKey, transactionRef);
    if (result.data.transaction_status !== "success") return void res.status(400).json({ error: "Payment not yet confirmed" });
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.publishingFeeRef, transactionRef) } as any);
    if (app && !app.publishingFeePaid) {
      await db.update(storeAppsTable)
        .set({ publishingFeePaid: true, status: "pending_review", trialUpload: false, trialSuspendedAt: null, updatedAt: new Date() } as any)
        .where(eq(storeAppsTable.id, app.id));
    }
    res.json({ status: "success", appId: app?.id ?? null, appName: app?.name ?? null });
  } catch (err: any) {
    logger.error({ err }, "verifySquad error");
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

// GET /store/payments/squad/callback — Squad redirect after payment
router.get("/payments/squad/callback", async (req, res) => {
  const { transaction_ref, status } = req.query as Record<string, string>;
  const baseUrl = getBaseUrl(req);
  try {
    if (transaction_ref) {
      const squadKey = await resolveSquadKey();
      const result = await squadVerifyTransaction(squadKey, transaction_ref).catch(() => null);
      if (result?.data?.transaction_status === "success") {
        const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.publishingFeeRef, transaction_ref) } as any);
        if (app && !app.publishingFeePaid) {
          await db.update(storeAppsTable)
            .set({ publishingFeePaid: true, status: "pending_review", trialUpload: false, trialSuspendedAt: null, updatedAt: new Date() } as any)
            .where(eq(storeAppsTable.id, app.id));
        }
        return void res.redirect(`${baseUrl}/app-store/developer?payment=squad&status=success&appId=${app?.id ?? ""}`);
      }
    }
    res.redirect(`${baseUrl}/app-store/developer?payment=squad&status=${status === "success" ? "failed" : (status ?? "failed")}`);
  } catch (err) {
    logger.error({ err }, "squadCallback error");
    res.redirect(`${baseUrl}/app-store/developer?payment=squad&status=failed`);
  }
});

// POST /store/payments/stripe/verify-usd — client-side confirmation after Stripe redirect
router.post("/payments/stripe/verify-usd", requireAuth(), async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return void res.status(400).json({ error: "sessionId required" });
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return void res.status(503).json({ error: "Stripe not configured" });
    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return void res.status(400).json({ error: "Payment not confirmed" });
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.publishingFeeRef, sessionId) } as any);
    if (app && !app.publishingFeePaid) {
      await db.update(storeAppsTable)
        .set({ publishingFeePaid: true, status: "pending_review", trialUpload: false, trialSuspendedAt: null, updatedAt: new Date() } as any)
        .where(eq(storeAppsTable.id, app.id));
    }
    res.json({ status: "success", appId: app?.id ?? null, appName: app?.name ?? null });
  } catch (err: any) {
    logger.error({ err }, "verifyStripeUsd error");
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

// POST /store/webhooks/squad — async Squad payment confirmation (public, before auth)
router.post("/webhooks/squad", async (req, res) => {
  try {
    const signature = (req.headers["x-squad-encrypted-body"] ?? req.headers["x-squad-signature"] ?? "") as string;
    const squadKey = await resolveSquadKey().catch(() => process.env.SQUAD_SECRET_KEY ?? "");
    if (squadKey && signature) {
      const valid = verifySquadWebhookSignature(squadKey, JSON.stringify(req.body), signature);
      if (!valid) return void res.status(401).send("Invalid signature");
    }
    const { Event, data } = req.body ?? {};
    if (Event === "charge_successful" && data?.metadata?.purpose === "africa_store_publishing_fee") {
      const ref: string | undefined = data.transaction_ref ?? data.transactionRef;
      if (ref) {
        const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.publishingFeeRef, ref) } as any);
        if (app && !app.publishingFeePaid) {
          await db.update(storeAppsTable)
            .set({ publishingFeePaid: true, status: "pending_review", trialUpload: false, trialSuspendedAt: null, updatedAt: new Date() } as any)
            .where(eq(storeAppsTable.id, app.id));
        }
      }
    }
    res.json({ status: "ok" });
  } catch (err) {
    logger.error({ err }, "squadWebhook error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/payments/paystack/verify — called after Paystack redirect
router.post("/payments/paystack/verify", requireAuth(), async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) return void res.status(400).json({ error: "reference required" });
    const txn = await verifyPaystackTransaction(reference);
    if (txn?.status !== "success") return void res.status(400).json({ error: "Payment not confirmed" });
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.publishingFeeRef, reference) } as any);
    if (app && !app.publishingFeePaid) {
      await db.update(storeAppsTable)
        .set({ publishingFeePaid: true, status: "pending_review", trialUpload: false, trialSuspendedAt: null, updatedAt: new Date() } as any)
        .where(eq(storeAppsTable.id, app.id));
    }
    res.json({ status: "success", appId: app?.id ?? null, appName: app?.name ?? null });
  } catch (err) {
    logger.error({ err }, "verifyPaystack error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/payments/interswitch/callback — Interswitch redirect after payment
router.get("/payments/interswitch/callback", async (req, res) => {
  try {
    const { txnRef, responseCode, amount } = req.query as Record<string, string>;
    const baseUrl = getBaseUrl(req);
    if (responseCode === "00" && txnRef) {
      const verification = await verifyInterswitchPayment(txnRef, parseInt(amount ?? "0") || PUBLISHING_FEE_KOBO);
      if (verification?.ResponseCode === "00") {
        const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.publishingFeeRef, txnRef) } as any);
        if (app && !app.publishingFeePaid) {
          await db.update(storeAppsTable)
            .set({ publishingFeePaid: true, status: "pending_review", trialUpload: false, trialSuspendedAt: null, updatedAt: new Date() } as any)
            .where(eq(storeAppsTable.id, app.id));
          return void res.redirect(`${baseUrl}/app-store/developer?payment=interswitch&status=success&appId=${app.id}`);
        }
      }
    }
    res.redirect(`${baseUrl}/app-store/developer?payment=interswitch&status=failed`);
  } catch (err) {
    logger.error({ err }, "interswitchCallback error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PAYSTACK WEBHOOK (public) ─────────────────────────────────────────────────

router.post("/webhooks/paystack", async (req, res) => {
  try {
    const hash = crypto.createHmac("sha512", PAYSTACK_SECRET).update(JSON.stringify(req.body)).digest("hex");
    if (hash !== req.headers["x-paystack-signature"]) return void res.status(401).send("Invalid signature");

    const { event, data } = req.body;

    if (event === "charge.success" && data?.metadata?.purpose === "africa_store_publishing_fee") {
      const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.publishingFeeRef, data.reference) } as any);
      if (app && !app.publishingFeePaid) {
        await db.update(storeAppsTable)
          .set({ publishingFeePaid: true, status: "pending_review", trialUpload: false, trialSuspendedAt: null, updatedAt: new Date() } as any)
          .where(eq(storeAppsTable.id, app.id));
        logger.info({ appId: app.id, reference: data.reference }, "[store] App publishing fee confirmed via Paystack webhook");
      }
    }

    // One-time developer account fee
    if (event === "charge.success" && data?.metadata?.purpose === "developer_account_fee") {
      const dev = await db.query.storeDeveloperAccountsTable.findFirst({
        where: eq(storeDeveloperAccountsTable.paymentRef, data.reference) as any,
      });
      if (dev && !(dev as any).registrationFeePaid) {
        await db.update(storeDeveloperAccountsTable)
          .set({ registrationFeePaid: true, paystackReference: data.reference, updatedAt: new Date() } as any)
          .where(eq(storeDeveloperAccountsTable.id, dev.id));
        logger.info({ developerId: dev.id, reference: data.reference }, "[store] Developer account fee confirmed via Paystack webhook");
      }
    }

    if (event === "dedicatedaccount.assign.success" && data?.dedicated_account?.account_number) {
      const customerCode = data.customer?.customer_code;
      if (customerCode) {
        await db.update(storeDeveloperAccountsTable)
          .set({
            dedicatedNgnAccount: {
              accountNumber: data.dedicated_account.account_number,
              bankName: data.dedicated_account.bank?.name ?? "Wema Bank",
              bankSlug: data.dedicated_account.bank?.slug ?? "wema-bank",
            },
            updatedAt: new Date(),
          } as any)
          .where(eq(storeDeveloperAccountsTable.paystackCustomerCode, customerCode));
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    logger.error({ err }, "paystackWebhook error");
    res.status(500).send("Error");
  }
});

// ─── ACCOUNT-LEVEL PAYMENT ROUTES ─────────────────────────────────────────────
// One-time fee charged per developer account (not per app).
// Uses same gateway infrastructure as per-app routes but targets
// storeDeveloperAccountsTable instead of storeAppsTable.

// POST /store/payments/account/initiate
router.post("/payments/account/initiate", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { gateway } = req.body;
    if (!gateway) return void res.status(400).json({ error: "gateway is required" });

    const dev = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.clerkUserId, userId!),
    });
    if (!dev) return void res.status(404).json({ error: "Developer account not found" });
    if ((dev as any).registrationFeePaid) return void res.status(400).json({ error: "Account fee already paid" });
    if ((dev as any).feeExempt) return void res.status(400).json({ error: "Your account is fee-exempt — no payment needed" });

    const baseUrl = getBaseUrl(req);
    const african = isAfricanCountry(dev.country);

    if (african) {
      if (gateway === "paystack") {
        const callbackUrl = `${baseUrl}/app-store/developer?payment=paystack&type=account`;
        const txn = await initPaystackTransaction(
          dev.email || `dev${dev.id}@africaappstore.com`,
          PUBLISHING_FEE_KOBO,
          { purpose: "developer_account_fee", developerId: dev.id },
          callbackUrl,
        );
        if (!txn) return void res.status(500).json({ error: "Could not initialize Paystack payment" });
        await db.update(storeDeveloperAccountsTable)
          .set({ paymentRef: txn.reference, paymentGateway: "paystack", registrationFeeAmountKobo: PUBLISHING_FEE_KOBO, updatedAt: new Date() } as any)
          .where(eq(storeDeveloperAccountsTable.id, dev.id));
        return void res.json({ gateway: "paystack", authorizationUrl: txn.authorization_url, reference: txn.reference });

      } else if (gateway === "interswitch") {
        const txnRef = `ACCT-${dev.id}-${Date.now()}`;
        const redirectUrl = `${baseUrl}/api/store/payments/account/interswitch/callback`;
        const { paymentUrl, formData } = buildInterswitchFormData(txnRef, redirectUrl);
        await db.update(storeDeveloperAccountsTable)
          .set({ paymentRef: txnRef, paymentGateway: "interswitch", registrationFeeAmountKobo: PUBLISHING_FEE_KOBO, updatedAt: new Date() } as any)
          .where(eq(storeDeveloperAccountsTable.id, dev.id));
        return void res.json({ gateway: "interswitch", paymentUrl, formData });

      } else {
        return void res.status(400).json({ error: "For African developers, gateway must be 'paystack' or 'interswitch'" });
      }
    } else {
      if (gateway === "squad") {
        const squadKey = await resolveSquadKey();
        const txnRef = `ACCT-USD-${dev.id}-${Date.now()}`;
        const callbackUrl = `${baseUrl}/api/store/payments/account/squad/callback`;
        const result = await squadInitiatePayment(squadKey, {
          email: dev.email || `dev${dev.id}@africaappstore.com`,
          amount: PUBLISHING_FEE_USD_CENTS,
          currency: "USD",
          initiateType: "redirect",
          callbackUrl,
          transactionRef: txnRef,
          customerName: dev.displayName ?? undefined,
          metadata: { purpose: "developer_account_fee", developerId: dev.id },
        });
        await db.update(storeDeveloperAccountsTable)
          .set({ paymentRef: txnRef, paymentGateway: "squad", registrationFeeAmountKobo: PUBLISHING_FEE_USD_CENTS, updatedAt: new Date() } as any)
          .where(eq(storeDeveloperAccountsTable.id, dev.id));
        return void res.json({ gateway: "squad", checkoutUrl: result.data.checkout_url, transactionRef: txnRef });

      } else if (gateway === "stripe") {
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeKey) return void res.status(503).json({ error: "Stripe is not configured on this platform" });
        const stripe = new Stripe(stripeKey);
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          customer_email: dev.email ?? undefined,
          line_items: [{
            price_data: {
              currency: "usd",
              product_data: { name: "Africa App Store — Developer Account" },
              unit_amount: PUBLISHING_FEE_USD_CENTS,
            },
            quantity: 1,
          }],
          metadata: { purpose: "developer_account_fee", developerId: String(dev.id) },
          success_url: `${baseUrl}/app-store/developer?payment=stripe&type=account&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/app-store/developer?payment=stripe&type=account&status=cancelled`,
        });
        await db.update(storeDeveloperAccountsTable)
          .set({ stripePaymentIntentId: session.id, paymentGateway: "stripe", registrationFeeAmountKobo: PUBLISHING_FEE_USD_CENTS, updatedAt: new Date() } as any)
          .where(eq(storeDeveloperAccountsTable.id, dev.id));
        return void res.json({ gateway: "stripe", checkoutUrl: session.url!, sessionId: session.id });

      } else {
        return void res.status(400).json({ error: "For non-African developers, gateway must be 'squad' or 'stripe'" });
      }
    }
  } catch (err: any) {
    logger.error({ err }, "initiateAccountPayment error");
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

// POST /store/payments/account/squad/verify — client-side confirm after Squad redirect
router.post("/payments/account/squad/verify", requireAuth(), async (req, res) => {
  try {
    const { transactionRef } = req.body;
    if (!transactionRef) return void res.status(400).json({ error: "transactionRef required" });
    const squadKey = await resolveSquadKey();
    const result = await squadVerifyTransaction(squadKey, transactionRef);
    if (result.data.transaction_status !== "success") return void res.status(400).json({ error: "Payment not yet confirmed" });
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.paymentRef, transactionRef) as any,
    });
    if (dev && !(dev as any).registrationFeePaid) {
      await db.update(storeDeveloperAccountsTable)
        .set({ registrationFeePaid: true, updatedAt: new Date() } as any)
        .where(eq(storeDeveloperAccountsTable.id, dev.id));
    }
    res.json({ status: "success" });
  } catch (err: any) {
    logger.error({ err }, "verifyAccountSquad error");
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

// GET /store/payments/account/squad/callback — Squad redirect
router.get("/payments/account/squad/callback", async (req, res) => {
  const { transaction_ref } = req.query as Record<string, string>;
  const baseUrl = getBaseUrl(req);
  try {
    if (transaction_ref) {
      const squadKey = await resolveSquadKey();
      const result = await squadVerifyTransaction(squadKey, transaction_ref).catch(() => null);
      if (result?.data?.transaction_status === "success") {
        const dev = await db.query.storeDeveloperAccountsTable.findFirst({
          where: eq(storeDeveloperAccountsTable.paymentRef, transaction_ref) as any,
        });
        if (dev && !(dev as any).registrationFeePaid) {
          await db.update(storeDeveloperAccountsTable)
            .set({ registrationFeePaid: true, updatedAt: new Date() } as any)
            .where(eq(storeDeveloperAccountsTable.id, dev.id));
        }
        return void res.redirect(`${baseUrl}/app-store/developer?payment=squad&type=account&status=success&transaction_ref=${transaction_ref}`);
      }
    }
    res.redirect(`${baseUrl}/app-store/developer?payment=squad&type=account&status=failed`);
  } catch {
    res.redirect(`${baseUrl}/app-store/developer?payment=squad&type=account&status=failed`);
  }
});

// POST /store/payments/account/paystack/verify — client-side confirm
router.post("/payments/account/paystack/verify", requireAuth(), async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) return void res.status(400).json({ error: "reference required" });
    const data = await verifyPaystackTransaction(reference);
    if (data?.status !== "success") return void res.status(400).json({ error: "Payment not verified" });
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.paymentRef, reference) as any,
    });
    if (dev && !(dev as any).registrationFeePaid) {
      await db.update(storeDeveloperAccountsTable)
        .set({ registrationFeePaid: true, paystackReference: reference, updatedAt: new Date() } as any)
        .where(eq(storeDeveloperAccountsTable.id, dev.id));
    }
    res.json({ status: "success" });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

// GET /store/payments/account/interswitch/callback — Interswitch redirect
router.get("/payments/account/interswitch/callback", async (req, res) => {
  const { txnRef, responseCode, amount } = req.query as Record<string, string>;
  const baseUrl = getBaseUrl(req);
  try {
    if (responseCode === "00" && txnRef) {
      const verification = await verifyInterswitchPayment(txnRef, parseInt(amount ?? "0") || PUBLISHING_FEE_KOBO);
      if (verification?.ResponseCode === "00") {
        const dev = await db.query.storeDeveloperAccountsTable.findFirst({
          where: eq(storeDeveloperAccountsTable.paymentRef, txnRef) as any,
        });
        if (dev && !(dev as any).registrationFeePaid) {
          await db.update(storeDeveloperAccountsTable)
            .set({ registrationFeePaid: true, updatedAt: new Date() } as any)
            .where(eq(storeDeveloperAccountsTable.id, dev.id));
          return void res.redirect(`${baseUrl}/app-store/developer?payment=interswitch&type=account&status=success`);
        }
      }
    }
    res.redirect(`${baseUrl}/app-store/developer?payment=interswitch&type=account&status=failed`);
  } catch (err) {
    logger.error({ err }, "accountInterswitchCallback error");
    res.redirect(`${baseUrl}/app-store/developer?payment=interswitch&type=account&status=failed`);
  }
});

// Also handle account fee via the Paystack webhook (charge.success with purpose=developer_account_fee)
// (wired into the existing webhooks/paystack handler below via purpose check)

// ─── MEMBER MANAGEMENT ─────────────────────────────────────────────────────────
// Each developer account supports up to 2 Clerk users: the owner + 1 member.
// Only the account owner (clerkUserId match) can add/remove the second seat.

// PUT /store/developers/me/member — set second seat
router.put("/developers/me/member", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    // Must be the owner — members themselves cannot reassign the seat
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.clerkUserId, userId!),
    });
    if (!dev) return void res.status(403).json({ error: "Only the account owner can manage members." });

    const { memberClerkUserId } = req.body;
    if (!memberClerkUserId || typeof memberClerkUserId !== "string")
      return void res.status(400).json({ error: "memberClerkUserId is required" });
    if (memberClerkUserId === userId)
      return void res.status(400).json({ error: "You cannot add yourself as a member." });

    // Ensure the Clerk ID isn't already an owner of another account
    const ownerConflict = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.clerkUserId, memberClerkUserId),
    });
    if (ownerConflict)
      return void res.status(409).json({ error: "That user already owns a developer account and cannot be added as a member." });

    // Ensure not already a member on a different account
    const memberConflict = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.memberClerkUserId, memberClerkUserId) as any,
    });
    if (memberConflict && memberConflict.id !== dev.id)
      return void res.status(409).json({ error: "That user already has a seat on another developer account." });

    const [updated] = await db.update(storeDeveloperAccountsTable)
      .set({ memberClerkUserId, updatedAt: new Date() } as any)
      .where(eq(storeDeveloperAccountsTable.id, dev.id))
      .returning();
    res.json(serializeDev(updated));
  } catch (err: any) {
    logger.error({ err }, "addMember error");
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

// DELETE /store/developers/me/member — remove second seat
router.delete("/developers/me/member", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.clerkUserId, userId!),
    });
    if (!dev) return void res.status(403).json({ error: "Only the account owner can manage members." });

    const [updated] = await db.update(storeDeveloperAccountsTable)
      .set({ memberClerkUserId: null, updatedAt: new Date() } as any)
      .where(eq(storeDeveloperAccountsTable.id, dev.id))
      .returning();
    res.json(serializeDev(updated));
  } catch (err: any) {
    logger.error({ err }, "removeMember error");
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
});

// ─── ADMIN ROUTES ──────────────────────────────────────────────────────────────

// GET /store/admin/me — lightweight admin check for the frontend nav/guard
router.get("/admin/me", requireAuth(), async (req, res) => {
  try {
    const admin = await checkIsAdmin(req);
    if (!admin) return void res.status(403).json({ error: "Admin only" });
    res.json({ isAdmin: true });
  } catch (err) {
    logger.error({ err }, "adminMe error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/admin/stats
router.get("/admin/stats", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const [totalApps] = await db.select({ count: sql<number>`count(*)::int` }).from(storeAppsTable);
    const [pending] = await db.select({ count: sql<number>`count(*)::int` }).from(storeAppsTable).where(eq(storeAppsTable.status, "pending_review"));
    const [approved] = await db.select({ count: sql<number>`count(*)::int` }).from(storeAppsTable).where(eq(storeAppsTable.status, "approved"));
    const [developers] = await db.select({ count: sql<number>`count(*)::int` }).from(storeDeveloperAccountsTable);
    const [downloads] = await db.select({ sum: sql<number>`coalesce(sum(total_downloads),0)::int` }).from(storeAppsTable);
    const [pendingPayment] = await db.select({ count: sql<number>`count(*)::int` }).from(storeAppsTable).where(eq(storeAppsTable.status, "pending_payment"));
    res.json({
      totalApps: totalApps.count,
      pendingPayment: pendingPayment.count,
      pendingReview: pending.count,
      approvedApps: approved.count,
      totalDevelopers: developers.count,
      totalDownloads: downloads.sum,
    });
  } catch (err) {
    logger.error({ err }, "adminStats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/admin/apps/pending
router.get("/admin/apps/pending", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const apps = await db.query.storeAppsTable.findMany({
      where: eq(storeAppsTable.status, "pending_review"),
      orderBy: asc(storeAppsTable.createdAt),
      with: { developer: true },
    });
    res.json(apps.map((a) => serializeApp(a, (a as any).developer)));
  } catch (err) {
    logger.error({ err }, "pendingApps error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/admin/apps
router.get("/admin/apps", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { status } = req.query as Record<string, string>;
    const where = status ? eq(storeAppsTable.status, status) : undefined;
    const apps = await db.query.storeAppsTable.findMany({
      where,
      orderBy: desc(storeAppsTable.createdAt),
      limit: 100,
      with: { developer: true },
    });
    res.json(apps.map((a) => serializeApp(a, (a as any).developer)));
  } catch (err) {
    logger.error({ err }, "adminApps error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/apps/:id/ai-review
router.post("/admin/apps/:id/ai-review", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.id, parseInt(String(req.params.id))) });
    if (!app) return void res.status(404).json({ error: "Not found" });

    const prompt = `You are an AI reviewer for Africa App Store. Review this app and respond ONLY with a JSON object.
App: ${app.name}
Category: ${app.category}
Platform: ${app.platform}
Tagline: ${app.tagline}
Description: ${app.description}
Download URL: ${app.downloadUrl}

Respond with EXACTLY this JSON structure:
{
  "summary": "2-3 sentence app summary for African users",
  "suggestedCategory": "one of the Africa App Store categories",
  "policyFlags": ["array of any policy concerns, or empty array"],
  "score": 85,
  "recommendation": "approve",
  "malwareHints": [],
  "africanRelevance": "brief note on relevance to African markets"
}
recommendation must be: approve, review, or reject`;

    let aiResult: any = null;
    try {
      const aiRes = await fetch(`${process.env.AI_INTEGRATIONS_OPENAI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.AI_INTEGRATIONS_OPENAI_API_KEY}` },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } }),
      });
      const aiData = await aiRes.json() as any;
      aiResult = JSON.parse(aiData.choices?.[0]?.message?.content ?? "{}");
    } catch (e) {
      logger.warn({ e }, "AI review failed, using fallback");
      aiResult = { summary: "Manual review required.", suggestedCategory: app.category, policyFlags: [], score: 50, recommendation: "review", malwareHints: [], africanRelevance: "N/A" };
    }

    await db.update(storeAppsTable).set({
      aiSummary: aiResult.summary ?? null,
      aiCategory: aiResult.suggestedCategory ?? null,
      aiPolicyFlags: JSON.stringify(aiResult.policyFlags ?? []),
      aiReviewScore: aiResult.score ?? null,
      aiReviewedAt: new Date(),
      updatedAt: new Date(),
    } as any).where(eq(storeAppsTable.id, app.id));

    res.json({ ...aiResult, appId: app.id });
  } catch (err) {
    logger.error({ err }, "aiReview error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/apps/:id/approve
router.post("/admin/apps/:id/approve", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    const appId = parseInt(String(req.params.id));

    // Fetch the app + developer email before updating so we have contact info.
    const app = await db.query.storeAppsTable.findFirst({
      where: eq(storeAppsTable.id, appId),
      with: { developer: true },
    });
    if (!app) return void res.status(404).json({ error: "App not found" });

    await db.update(storeAppsTable).set({
      status: "approved",
      reviewedByClerkId: userId,
      reviewedAt: new Date(),
      rejectionReason: null,
      updatedAt: new Date(),
    } as any).where(eq(storeAppsTable.id, appId));

    // Notify the developer — best-effort, never blocks the admin response.
    const developer = (app as any).developer as { email: string; displayName: string } | null;
    if (developer?.email) {
      const _storePageUrl = publicAppUrl((app as any).publicId) ?? "https://awajimaaappstore.com";
      const _dlUrl = canonicalDownloadUrl(app);
      const html = wrapVendorEmail({
        bodyHtml: `
          <h1 style="text-align:center;font-size:20px;color:#1a1a1a;margin:0 0 16px;">
            Your app has been approved 🎉
          </h1>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            Hi ${escapeHtml(developer.displayName)},
          </p>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            We're pleased to let you know that <strong>${escapeHtml(app.name)}</strong>
            has been reviewed and is now <strong>approved</strong> on the Awajimaa App Store.
            It is now publicly visible and available for download.
          </p>
          <p style="font-size:14px;line-height:1.6;color:#444;margin-bottom:4px;"><strong>Your app links:</strong></p>
          <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
            <tr>
              <td style="font-size:12px;color:#888;padding:6px 0 2px;width:120px;">Store Page</td>
              <td style="padding:6px 0 2px;">
                <a href="${_storePageUrl}" style="color:#00c853;font-size:13px;word-break:break-all;">${_storePageUrl}</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#888;padding:6px 0 2px;">Download Link</td>
              <td style="padding:6px 0 2px;">
                <a href="${_dlUrl}" style="color:#00c853;font-size:13px;word-break:break-all;">${_dlUrl}</a>
              </td>
            </tr>
          </table>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            Thank you for contributing to the Awajimaa ecosystem.
          </p>
        `,
      });
      sendEmail({
        to: developer.email,
        subject: `Your app "${app.name}" has been approved`,
        html,
      }).catch(() => {/* best-effort */});
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "approveApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/apps/:id/reject
router.post("/admin/apps/:id/reject", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    const appId = parseInt(String(req.params.id));
    const { reason } = req.body;
    const rejectionReason = (typeof reason === "string" && reason.trim())
      ? reason.trim()
      : "Did not meet store guidelines";

    // Fetch the app + developer email before updating.
    const app = await db.query.storeAppsTable.findFirst({
      where: eq(storeAppsTable.id, appId),
      with: { developer: true },
    });
    if (!app) return void res.status(404).json({ error: "App not found" });

    await db.update(storeAppsTable).set({
      status: "rejected",
      reviewedByClerkId: userId,
      reviewedAt: new Date(),
      rejectionReason,
      updatedAt: new Date(),
    } as any).where(eq(storeAppsTable.id, appId));

    // Notify the developer — best-effort.
    const developer = (app as any).developer as { email: string; displayName: string } | null;
    if (developer?.email) {
      const html = wrapVendorEmail({
        bodyHtml: `
          <h1 style="text-align:center;font-size:20px;color:#1a1a1a;margin:0 0 16px;">
            Update on your app submission
          </h1>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            Hi ${escapeHtml(developer.displayName)},
          </p>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            Thank you for submitting <strong>${escapeHtml(app.name)}</strong> to the Awajimaa App Store.
            After review, we were unable to approve this submission at this time.
          </p>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            <strong>Reason:</strong> ${escapeHtml(rejectionReason)}
          </p>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            Please address the feedback above and resubmit when ready.
            If you have questions, reply to this email or contact our support team.
          </p>
        `,
      });
      sendEmail({
        to: developer.email,
        subject: `Update on your "${app.name}" submission`,
        html,
      }).catch(() => {/* best-effort */});
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "rejectApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/apps/:id/feature
router.post("/admin/apps/:id/feature", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.id, parseInt(String(req.params.id))) });
    if (!app) return void res.status(404).json({ error: "Not found" });
    await db.update(storeAppsTable).set({ isFeatured: !app.isFeatured, updatedAt: new Date() } as any).where(eq(storeAppsTable.id, app.id));
    res.json({ isFeatured: !app.isFeatured });
  } catch (err) {
    logger.error({ err }, "featureApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/admin/developers
router.get("/admin/developers", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const devs = await db.query.storeDeveloperAccountsTable.findMany({ orderBy: desc(storeDeveloperAccountsTable.createdAt) });
    res.json(devs.map(serializeDev));
  } catch (err) {
    logger.error({ err }, "adminDevelopers error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/developers/:id/suspend
router.post("/admin/developers/:id/suspend", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({ where: eq(storeDeveloperAccountsTable.id, parseInt(String(req.params.id))) });
    if (!dev) return void res.status(404).json({ error: "Not found" });
    const newStatus = dev.status === "active" ? "suspended" : "active";
    await db.update(storeDeveloperAccountsTable).set({ status: newStatus, suspensionReason: req.body.reason ?? null, updatedAt: new Date() } as any).where(eq(storeDeveloperAccountsTable.id, dev.id));
    res.json({ status: newStatus });
  } catch (err) {
    logger.error({ err }, "suspendDeveloper error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/developers/:id/toggle-fee-exempt — waive or restore publishing fee
router.post("/admin/developers/:id/toggle-fee-exempt", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({ where: eq(storeDeveloperAccountsTable.id, parseInt(String(req.params.id))) });
    if (!dev) return void res.status(404).json({ error: "Not found" });
    const newVal = !dev.feeExempt;
    await db.update(storeDeveloperAccountsTable).set({ feeExempt: newVal, updatedAt: new Date() } as any).where(eq(storeDeveloperAccountsTable.id, dev.id));
    res.json({ feeExempt: newVal });
  } catch (err) {
    logger.error({ err }, "toggleFeeExempt error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/apps/:id/direct-approve — admin bypasses fee and immediately approves
router.post("/admin/apps/:id/direct-approve", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    const appId = parseInt(String(req.params.id));
    const app = await db.query.storeAppsTable.findFirst({
      where: eq(storeAppsTable.id, appId),
      with: { developer: true },
    });
    if (!app) return void res.status(404).json({ error: "App not found" });

    await db.update(storeAppsTable).set({
      status: "approved",
      publishingFeePaid: true,
      publishingFeeGateway: "admin_waived",
      reviewedByClerkId: userId,
      reviewedAt: new Date(),
      rejectionReason: null,
      updatedAt: new Date(),
    } as any).where(eq(storeAppsTable.id, appId));

    const developer = (app as any).developer as { email: string; displayName: string } | null;
    if (developer?.email) {
      const _storePageUrl = publicAppUrl((app as any).publicId) ?? "https://awajimaaappstore.com";
      const _dlUrl = canonicalDownloadUrl(app);
      const html = wrapVendorEmail({
        bodyHtml: `<h1 style="text-align:center;font-size:20px;color:#1a1a1a;margin:0 0 16px;">Your app has been approved 🎉</h1>
          <p style="font-size:14px;line-height:1.6;color:#444;">Hi ${escapeHtml(developer.displayName)},</p>
          <p style="font-size:14px;line-height:1.6;color:#444;"><strong>${escapeHtml(app.name)}</strong> has been approved and is now live on the Awajimaa App Store. The publishing fee has been waived by an administrator.</p>
          <p style="font-size:14px;line-height:1.6;color:#444;margin-bottom:4px;"><strong>Your app links:</strong></p>
          <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
            <tr>
              <td style="font-size:12px;color:#888;padding:6px 0 2px;width:120px;">Store Page</td>
              <td style="padding:6px 0 2px;"><a href="${_storePageUrl}" style="color:#00c853;font-size:13px;word-break:break-all;">${_storePageUrl}</a></td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#888;padding:6px 0 2px;">Download Link</td>
              <td style="padding:6px 0 2px;"><a href="${_dlUrl}" style="color:#00c853;font-size:13px;word-break:break-all;">${_dlUrl}</a></td>
            </tr>
          </table>`,
      });
      sendEmail({ to: developer.email, subject: `Your app "${app.name}" is now live`, html }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "directApprove error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/apps/:id/assign-download
router.post("/admin/apps/:id/assign-download", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { downloadUrl } = req.body;
    if (!downloadUrl) return void res.status(400).json({ error: "downloadUrl required" });
    await db.update(storeAppsTable).set({ downloadUrl, updatedAt: new Date() } as any).where(eq(storeAppsTable.id, parseInt(String(req.params.id))));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "assignDownload error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── ADMIN VERSION MANAGEMENT ─────────────────────────────────────────────────

/** Shared upload handler for admin version APK uploads */
const _versionUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

/** Upload a buffer to object storage and return the public URL derived from the request host. */
async function uploadToObjectStorage(buffer: Buffer, mimetype: string, req: any): Promise<{ publicUrl: string; fileSize: number }> {
  const _obj = new ObjectStorageService();
  const uploadUrl = await _obj.getObjectEntityUploadURL();
  const putRes = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mimetype }, body: buffer as unknown as Uint8Array });
  if (!putRes.ok) throw new Error(`Object storage upload failed (${putRes.status})`);
  const objectPath = _obj.normalizeObjectEntityPath(uploadUrl);
  await _obj.trySetObjectEntityAclPolicy(objectPath, { owner: "system:store-apk", visibility: "public" });
  const objectId = objectPath.replace(/^\/objects\/uploads\//, "");
  const proto = (req.get("x-forwarded-proto") as string | undefined) ?? req.protocol ?? "https";
  const host = req.get("host") as string;
  return { publicUrl: `${proto}://${host}/api/media/${objectId}`, fileSize: buffer.length };
}

// GET /store/admin/apps/:id/versions
router.get("/admin/apps/:id/versions", requireAuth(), async (req: any, res: any) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const appId = parseInt(String(req.params.id));
    const versions = await db.query.storeAppVersionsTable.findMany({
      where: eq(storeAppVersionsTable.appId, appId),
      orderBy: desc(storeAppVersionsTable.createdAt),
    });
    res.json(versions.map(serializeVersion));
  } catch (err) {
    logger.error({ err }, "adminListVersions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/apps/:id/versions — upload + register a new version
router.post("/admin/apps/:id/versions", requireAuth(), _versionUpload.single("file"), async (req: any, res: any) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    const appId = parseInt(String(req.params.id));
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.id, appId) });
    if (!app) return void res.status(404).json({ error: "App not found" });

    const { version, releaseNotes, minOsVersion, autoActivate } = req.body;
    if (!version) return void res.status(400).json({ error: "version is required" });

    // Upload file if provided, or accept a pre-existing fileUrl in body
    let fileUrl: string | null = req.body.fileUrl ?? null;
    let fileSize: number | null = null;
    if (req.file) {
      const result = await uploadToObjectStorage(req.file.buffer, req.file.mimetype, req);
      fileUrl = result.publicUrl;
      fileSize = result.fileSize;
    }

    // Mirror to GCS for permanent, non-expiring hosting
    if (fileUrl && isR2Configured()) {
      try {
        const gcsUrl = await mirrorUrlToR2(fileUrl);
        fileUrl = gcsUrl;
        logger.info({ gcsUrl }, "APK mirrored to GCS");
      } catch (gcsErr) {
        logger.warn({ err: gcsErr }, "GCS mirror failed — keeping original URL");
      }
    }

    // Auto-assign the next integer version code
    const [{ maxCode }] = await db.select({ maxCode: sql<number>`COALESCE(MAX(version_code), 0)` })
      .from(storeAppVersionsTable).where(eq(storeAppVersionsTable.appId, appId));
    const versionCode = maxCode + 1;

    const shouldActivate = (autoActivate === "true" || autoActivate === true) && !!fileUrl;
    const now = new Date();

    if (shouldActivate) {
      await db.update(storeAppVersionsTable).set({ status: "deprecated" })
        .where(and(eq(storeAppVersionsTable.appId, appId), eq(storeAppVersionsTable.status, "live")));
    }

    const [v] = await db.insert(storeAppVersionsTable).values({
      appId,
      version,
      versionCode,
      releaseNotes: releaseNotes ?? null,
      fileUrl,
      fileSize: fileSize !== null ? String(fileSize) : null,
      minOsVersion: minOsVersion ?? null,
      uploadedByClerkId: userId,
      status: shouldActivate ? "live" : "pending",
      activatedAt: shouldActivate ? now : null,
      activatedByClerkId: shouldActivate ? userId : null,
    } as any).returning();

    if (shouldActivate) {
      await db.update(storeAppsTable)
        .set({ downloadUrl: fileUrl as string, currentVersion: version, updatedAt: now })
        .where(eq(storeAppsTable.id, appId));
    }

    res.status(201).json(serializeVersion(v));
  } catch (err) {
    logger.error({ err }, "adminAddVersion error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/apps/:id/versions/:versionId/activate — make a version live (rollback support)
router.post("/admin/apps/:id/versions/:versionId/activate", requireAuth(), async (req: any, res: any) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    const appId = parseInt(String(req.params.id));
    const versionId = parseInt(String(req.params.versionId));

    const [app, version] = await Promise.all([
      db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.id, appId) }),
      db.query.storeAppVersionsTable.findFirst({
        where: and(eq(storeAppVersionsTable.id, versionId), eq(storeAppVersionsTable.appId, appId)),
      }),
    ]);
    if (!app) return void res.status(404).json({ error: "App not found" });
    if (!version) return void res.status(404).json({ error: "Version not found" });
    if (!version.fileUrl) return void res.status(400).json({ error: "This version has no file — upload a file before activating" });

    const now = new Date();
    // Deprecate all currently live versions
    await db.update(storeAppVersionsTable).set({ status: "deprecated" })
      .where(and(eq(storeAppVersionsTable.appId, appId), eq(storeAppVersionsTable.status, "live")));
    // Activate the chosen version
    await db.update(storeAppVersionsTable)
      .set({ status: "live", activatedAt: now, activatedByClerkId: userId })
      .where(eq(storeAppVersionsTable.id, versionId));
    // Sync the app's canonical download URL and version label
    await db.update(storeAppsTable)
      .set({ downloadUrl: version.fileUrl, currentVersion: version.version, updatedAt: now })
      .where(eq(storeAppsTable.id, appId));

    // Notify subscribers of the new version (fire-and-forget)
    notifySubscribersOfNewVersion(appId, app.name, app.slug, version.version, version.fileUrl).catch(() => {});

    res.json({ ok: true, message: `v${version.version} is now live` });
  } catch (err) {
    logger.error({ err }, "activateVersion error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PLATFORM LINKING ──────────────────────────────────────────────────────────

// Token encryption (AES-256-GCM keyed from SESSION_SECRET)
const _encKey = (() => {
  const secret = process.env.SESSION_SECRET ?? "africa-store-fallback-key-dev";
  return crypto.scryptSync(secret, "store-platform-v1", 32);
})();
function encryptToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", _encKey, iv);
  const enc = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}
function decryptToken(stored: string): string {
  try {
    const buf = Buffer.from(stored, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", _encKey, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
  } catch { return ""; }
}

// Platform configs
const PLATFORM_META: Record<string, { name: string; icon: string; supportsRepos: boolean; selfHosted: boolean }> = {
  github:    { name: "GitHub",    icon: "🐙", supportsRepos: true,  selfHosted: false },
  gitlab:    { name: "GitLab",    icon: "🦊", supportsRepos: true,  selfHosted: true  },
  gitbucket: { name: "Gitbucket", icon: "🪣", supportsRepos: true,  selfHosted: true  },
  bitbucket: { name: "Bitbucket", icon: "🗂️", supportsRepos: true,  selfHosted: false },
  heroku:    { name: "Heroku",    icon: "🚂", supportsRepos: false, selfHosted: false },
  netlify:   { name: "Netlify",   icon: "🌐", supportsRepos: false, selfHosted: false },
  vercel:    { name: "Vercel",    icon: "▲",  supportsRepos: false, selfHosted: false },
  render:    { name: "Render",    icon: "🎨", supportsRepos: false, selfHosted: false },
};

async function verifyPlatformPAT(platform: string, token: string, instanceUrl?: string): Promise<{ ok: boolean; username?: string; displayName?: string; avatarUrl?: string }> {
  try {
    const h = (extra?: Record<string, string>) => ({ ...extra });
    switch (platform) {
      case "github": {
        const r = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
        if (!r.ok) return { ok: false };
        const d = await r.json() as any;
        return { ok: true, username: d.login, displayName: d.name ?? d.login, avatarUrl: d.avatar_url };
      }
      case "gitlab": {
        const base = instanceUrl ?? "https://gitlab.com";
        const r = await fetch(`${base}/api/v4/user`, { headers: { "PRIVATE-TOKEN": token } });
        if (!r.ok) return { ok: false };
        const d = await r.json() as any;
        return { ok: true, username: d.username, displayName: d.name, avatarUrl: d.avatar_url };
      }
      case "gitbucket": {
        if (!instanceUrl) return { ok: false };
        const r = await fetch(`${instanceUrl}/api/v3/user`, { headers: { Authorization: `token ${token}` } });
        if (!r.ok) return { ok: false };
        const d = await r.json() as any;
        return { ok: true, username: d.login, displayName: d.name ?? d.login, avatarUrl: d.avatar_url };
      }
      case "bitbucket": {
        const r = await fetch("https://api.bitbucket.org/2.0/user", { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return { ok: false };
        const d = await r.json() as any;
        return { ok: true, username: d.username, displayName: d.display_name };
      }
      case "heroku": {
        const r = await fetch("https://api.heroku.com/account", { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.heroku+json; version=3" } });
        if (!r.ok) return { ok: false };
        const d = await r.json() as any;
        return { ok: true, username: d.email, displayName: d.name ?? d.email };
      }
      case "netlify": {
        const r = await fetch("https://api.netlify.com/api/v1/user", { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return { ok: false };
        const d = await r.json() as any;
        return { ok: true, username: d.email, displayName: d.full_name ?? d.email, avatarUrl: d.avatar_url };
      }
      case "vercel": {
        const r = await fetch("https://api.vercel.com/v2/user", { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return { ok: false };
        const d = await r.json() as any;
        return { ok: true, username: d.user?.username, displayName: d.user?.name ?? d.user?.username };
      }
      case "render": {
        const r = await fetch("https://api.render.com/v1/owner", { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return { ok: false };
        const d = await r.json() as any;
        return { ok: true, username: d.owner?.email, displayName: d.owner?.name ?? d.owner?.email };
      }
      default: return { ok: false };
    }
  } catch { return { ok: false }; }
}

async function listPlatformRepos(platform: string, token: string, instanceUrl?: string): Promise<Array<{ path: string; name: string; url: string; defaultBranch: string; description?: string }>> {
  try {
    switch (platform) {
      case "github": {
        const r = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated&type=owner", { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
        const d = await r.json() as any[];
        return Array.isArray(d) ? d.map((x: any) => ({ path: x.full_name, name: x.name, url: x.html_url, defaultBranch: x.default_branch ?? "main", description: x.description })) : [];
      }
      case "gitlab": {
        const base = instanceUrl ?? "https://gitlab.com";
        const r = await fetch(`${base}/api/v4/projects?membership=true&per_page=100&order_by=updated_at`, { headers: { "PRIVATE-TOKEN": token } });
        const d = await r.json() as any[];
        return Array.isArray(d) ? d.map((x: any) => ({ path: x.path_with_namespace, name: x.name, url: x.web_url, defaultBranch: x.default_branch ?? "main", description: x.description })) : [];
      }
      case "gitbucket": {
        if (!instanceUrl) return [];
        const r = await fetch(`${instanceUrl}/api/v3/user/repos`, { headers: { Authorization: `token ${token}` } });
        const d = await r.json() as any[];
        return Array.isArray(d) ? d.map((x: any) => ({ path: x.full_name, name: x.name, url: x.html_url, defaultBranch: "main" })) : [];
      }
      case "bitbucket": {
        const r = await fetch("https://api.bitbucket.org/2.0/repositories?role=member&pagelen=100", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json() as any;
        return (d.values ?? []).map((x: any) => ({ path: x.full_name, name: x.name, url: x.links?.html?.href, defaultBranch: x.mainbranch?.name ?? "main", description: x.description }));
      }
      case "heroku": {
        const r = await fetch("https://api.heroku.com/apps", { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.heroku+json; version=3" } });
        const d = await r.json() as any[];
        return Array.isArray(d) ? d.map((x: any) => ({ path: x.name, name: x.name, url: x.web_url, defaultBranch: "main", description: `Region: ${x.region?.name}` })) : [];
      }
      case "netlify": {
        const r = await fetch("https://api.netlify.com/api/v1/sites", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json() as any[];
        return Array.isArray(d) ? d.map((x: any) => ({ path: x.id, name: x.name, url: x.ssl_url ?? x.url, defaultBranch: x.build_settings?.branch ?? "main", description: x.custom_domain })) : [];
      }
      case "vercel": {
        const r = await fetch("https://api.vercel.com/v9/projects", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json() as any;
        return (d.projects ?? []).map((x: any) => ({ path: x.id, name: x.name, url: `https://${x.name}.vercel.app`, defaultBranch: x.link?.productionBranch ?? "main" }));
      }
      case "render": {
        const r = await fetch("https://api.render.com/v1/services?limit=100", { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json() as any[];
        return Array.isArray(d) ? d.map((x: any) => ({ path: x.service?.id ?? x.id, name: x.service?.name ?? x.id, url: x.service?.serviceDetails?.url ?? "", defaultBranch: "main" })) : [];
      }
      default: return [];
    }
  } catch { return []; }
}

async function getLatestCommit(platform: string, token: string, repoPath: string, branch: string, instanceUrl?: string): Promise<{ sha: string; message: string; author: string; url: string; date: string } | null> {
  try {
    switch (platform) {
      case "github": {
        const r = await fetch(`https://api.github.com/repos/${repoPath}/commits/${branch}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } });
        if (!r.ok) return null;
        const d = await r.json() as any;
        return { sha: String(d.sha ?? "").slice(0, 8), message: String(d.commit?.message ?? "").split("\n")[0], author: d.commit?.author?.name ?? "Unknown", url: d.html_url ?? "", date: d.commit?.author?.date ?? "" };
      }
      case "gitlab": {
        const base = instanceUrl ?? "https://gitlab.com";
        const r = await fetch(`${base}/api/v4/projects/${encodeURIComponent(repoPath)}/repository/commits?ref_name=${branch}&per_page=1`, { headers: { "PRIVATE-TOKEN": token } });
        if (!r.ok) return null;
        const d = (await r.json() as any[])[0];
        if (!d) return null;
        return { sha: d.short_id ?? String(d.id ?? "").slice(0, 8), message: d.title ?? "", author: d.author_name ?? "Unknown", url: d.web_url ?? "", date: d.committed_date ?? "" };
      }
      case "gitbucket": {
        if (!instanceUrl) return null;
        const r = await fetch(`${instanceUrl}/api/v3/repos/${repoPath}/commits?sha=${branch}&per_page=1`, { headers: { Authorization: `token ${token}` } });
        if (!r.ok) return null;
        const d = (await r.json() as any[])[0];
        if (!d) return null;
        return { sha: String(d.sha ?? "").slice(0, 8), message: String(d.commit?.message ?? "").split("\n")[0], author: d.commit?.author?.name ?? "Unknown", url: d.html_url ?? "", date: d.commit?.author?.date ?? "" };
      }
      case "bitbucket": {
        const r = await fetch(`https://api.bitbucket.org/2.0/repositories/${repoPath}/commits/${branch}?pagelen=1`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return null;
        const d = (await r.json() as any).values?.[0];
        if (!d) return null;
        return { sha: String(d.hash ?? "").slice(0, 8), message: String(d.message ?? "").split("\n")[0], author: d.author?.raw ?? "Unknown", url: d.links?.html?.href ?? "", date: d.date ?? "" };
      }
      default: return null;
    }
  } catch { return null; }
}

function serializeLinkedAccount(a: any) {
  return {
    id: a.id, developerId: a.developerId, platform: a.platform,
    username: a.username ?? null, displayName: a.displayName ?? null,
    instanceUrl: a.instanceUrl ?? null, avatarUrl: a.avatarUrl ?? null,
    verified: a.verified, createdAt: a.createdAt.toISOString(),
  };
}

function serializeRepoLink(rl: any, account?: any) {
  return {
    id: rl.id, appId: rl.appId, linkedAccountId: rl.linkedAccountId,
    platform: account?.platform ?? null, username: account?.username ?? null,
    repoPath: rl.repoPath, branch: rl.branch ?? "main",
    deploymentUrl: rl.deploymentUrl ?? null,
    lastCommitSha: rl.lastCommitSha ?? null, lastCommitMessage: rl.lastCommitMessage ?? null,
    lastCommitAuthor: rl.lastCommitAuthor ?? null, lastCommitUrl: rl.lastCommitUrl ?? null,
    lastSyncedAt: rl.lastSyncedAt?.toISOString() ?? null,
    createdAt: rl.createdAt.toISOString(),
  };
}

function serializeUpdateRequest(req: any, app?: any, dev?: any) {
  return {
    id: req.id, appId: req.appId,
    appName: app?.name ?? "Unknown", appSlug: app?.slug ?? "",
    developerName: dev?.displayName ?? "Unknown", developerId: req.developerId,
    platform: req.platform, repoPath: req.repoPath ?? null,
    commitSha: req.commitSha ?? null, commitMessage: req.commitMessage ?? null,
    commitUrl: req.commitUrl ?? null, commitAuthor: req.commitAuthor ?? null,
    newVersion: req.newVersion ?? null, newDownloadUrl: req.newDownloadUrl ?? null,
    newDescription: req.newDescription ?? null, changesSummary: req.changesSummary ?? null,
    status: req.status, adminUserId: req.adminUserId ?? null,
    adminNote: req.adminNote ?? null, reviewedAt: req.reviewedAt?.toISOString() ?? null,
    createdAt: req.createdAt.toISOString(),
  };
}

// GET /store/linked-accounts
router.get("/linked-accounts", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const accounts = await db.query.storeLinkedAccountsTable.findMany({
      where: eq(storeLinkedAccountsTable.developerId, dev.id),
      orderBy: desc(storeLinkedAccountsTable.createdAt),
    });
    res.json(accounts.map(serializeLinkedAccount));
  } catch (err) {
    logger.error({ err }, "listLinkedAccounts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/linked-accounts — connect a platform with a PAT
router.post("/linked-accounts", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const { platform, accessToken, instanceUrl } = req.body;
    if (!platform || !accessToken) return void res.status(400).json({ error: "platform and accessToken are required" });
    if (!PLATFORM_META[platform]) return void res.status(400).json({ error: `Unknown platform: ${platform}` });

    // Verify the token against the platform
    const verified = await verifyPlatformPAT(platform, accessToken, instanceUrl);
    if (!verified.ok) return void res.status(400).json({ error: `Could not verify token with ${PLATFORM_META[platform].name}. Check your PAT and permissions.` });

    // One account per platform per developer (upsert pattern)
    const existing = await db.query.storeLinkedAccountsTable.findFirst({
      where: and(eq(storeLinkedAccountsTable.developerId, dev.id), eq(storeLinkedAccountsTable.platform, platform)),
    });
    const encrypted = encryptToken(accessToken);
    if (existing) {
      const [updated] = await db.update(storeLinkedAccountsTable)
        .set({ accessToken: encrypted, username: verified.username ?? null, displayName: verified.displayName ?? null, avatarUrl: verified.avatarUrl ?? null, instanceUrl: instanceUrl ?? null, verified: true })
        .where(eq(storeLinkedAccountsTable.id, existing.id)).returning();
      return void res.json(serializeLinkedAccount(updated));
    }
    const [created] = await db.insert(storeLinkedAccountsTable).values({
      developerId: dev.id, platform, accessToken: encrypted,
      username: verified.username ?? null, displayName: verified.displayName ?? null,
      avatarUrl: verified.avatarUrl ?? null, instanceUrl: instanceUrl ?? null, verified: true,
    }).returning();
    res.status(201).json(serializeLinkedAccount(created));
  } catch (err) {
    logger.error({ err }, "connectPlatform error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /store/linked-accounts/:id
router.delete("/linked-accounts/:id", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const acct = await db.query.storeLinkedAccountsTable.findFirst({
      where: and(eq(storeLinkedAccountsTable.id, parseInt(String(req.params.id))), eq(storeLinkedAccountsTable.developerId, dev.id)),
    });
    if (!acct) return void res.status(404).json({ error: "Not found" });
    await db.delete(storeLinkedAccountsTable).where(eq(storeLinkedAccountsTable.id, acct.id));
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "disconnectPlatform error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/linked-accounts/:id/repos — list repos/sites for a connected account
router.get("/linked-accounts/:id/repos", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const acct = await db.query.storeLinkedAccountsTable.findFirst({
      where: and(eq(storeLinkedAccountsTable.id, parseInt(String(req.params.id))), eq(storeLinkedAccountsTable.developerId, dev.id)),
    });
    if (!acct) return void res.status(404).json({ error: "Not found" });
    const token = decryptToken(acct.accessToken);
    const repos = await listPlatformRepos(acct.platform, token, acct.instanceUrl ?? undefined);
    res.json(repos);
  } catch (err) {
    logger.error({ err }, "listRepos error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/apps/:id/repo-link
router.get("/apps/:id/repo-link", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const appId = parseInt(String(req.params.id));
    const app = await db.query.storeAppsTable.findFirst({ where: and(eq(storeAppsTable.id, appId), eq(storeAppsTable.developerId, dev.id)) });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const link = await db.query.storeAppRepoLinksTable.findFirst({ where: eq(storeAppRepoLinksTable.appId, appId) });
    if (!link) return void res.json(null);
    const acct = await db.query.storeLinkedAccountsTable.findFirst({ where: eq(storeLinkedAccountsTable.id, link.linkedAccountId) });
    res.json(serializeRepoLink(link, acct));
  } catch (err) {
    logger.error({ err }, "getRepoLink error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/apps/:id/repo-link — link an app to a repo/deployment
router.post("/apps/:id/repo-link", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const appId = parseInt(String(req.params.id));
    const app = await db.query.storeAppsTable.findFirst({ where: and(eq(storeAppsTable.id, appId), eq(storeAppsTable.developerId, dev.id)) });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const { linkedAccountId, repoPath, branch, deploymentUrl } = req.body;
    if (!linkedAccountId || !repoPath) return void res.status(400).json({ error: "linkedAccountId and repoPath are required" });
    const acct = await db.query.storeLinkedAccountsTable.findFirst({
      where: and(eq(storeLinkedAccountsTable.id, parseInt(linkedAccountId)), eq(storeLinkedAccountsTable.developerId, dev.id)),
    });
    if (!acct) return void res.status(404).json({ error: "Linked account not found" });

    // Remove existing link first
    await db.delete(storeAppRepoLinksTable).where(eq(storeAppRepoLinksTable.appId, appId));

    const [link] = await db.insert(storeAppRepoLinksTable).values({
      appId, linkedAccountId: acct.id, repoPath, branch: branch ?? "main",
      deploymentUrl: deploymentUrl ?? null,
    }).returning();
    res.status(201).json(serializeRepoLink(link, acct));
  } catch (err) {
    logger.error({ err }, "linkRepo error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /store/apps/:id/repo-link
router.delete("/apps/:id/repo-link", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const appId = parseInt(String(req.params.id));
    const app = await db.query.storeAppsTable.findFirst({ where: and(eq(storeAppsTable.id, appId), eq(storeAppsTable.developerId, dev.id)) });
    if (!app) return void res.status(404).json({ error: "Not found" });
    await db.delete(storeAppRepoLinksTable).where(eq(storeAppRepoLinksTable.appId, appId));
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "unlinkRepo error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/apps/:id/request-update — fetch latest commit and create update request
router.post("/apps/:id/request-update", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const appId = parseInt(String(req.params.id));
    const app = await db.query.storeAppsTable.findFirst({ where: and(eq(storeAppsTable.id, appId), eq(storeAppsTable.developerId, dev.id)) });
    if (!app) return void res.status(404).json({ error: "Not found" });

    // Guard: if the app has a locked package name, reject mismatches
    const { newPackageName } = req.body;
    if (app.packageName && newPackageName && newPackageName !== app.packageName) {
      return void res.status(400).json({
        error: `Package name mismatch. This app is permanently registered as "${app.packageName}". You cannot change the package name on an update.`,
      });
    }

    const link = await db.query.storeAppRepoLinksTable.findFirst({ where: eq(storeAppRepoLinksTable.appId, appId) });
    if (!link) return void res.status(400).json({ error: "No repository linked to this app. Link a repository first." });

    const acct = await db.query.storeLinkedAccountsTable.findFirst({ where: eq(storeLinkedAccountsTable.id, link.linkedAccountId) });
    if (!acct) return void res.status(400).json({ error: "Linked account not found" });

    const { newVersion, newDownloadUrl, newDescription } = req.body;
    const token = decryptToken(acct.accessToken);

    // Fetch latest commit info
    const commit = await getLatestCommit(acct.platform, token, link.repoPath, link.branch ?? "main", acct.instanceUrl ?? undefined);

    // Check for duplicate pending request with same commit
    if (commit?.sha) {
      const dupe = await db.query.storeAppUpdateRequestsTable.findFirst({
        where: and(eq(storeAppUpdateRequestsTable.appId, appId), eq(storeAppUpdateRequestsTable.commitSha, commit.sha), eq(storeAppUpdateRequestsTable.status, "pending")),
      });
      if (dupe) return void res.status(409).json({ error: "A pending update request already exists for this commit." });
    }

    const [request] = await db.insert(storeAppUpdateRequestsTable).values({
      appId, developerId: dev.id, repoLinkId: link.id,
      platform: acct.platform, repoPath: link.repoPath,
      commitSha: commit?.sha ?? null, commitMessage: commit?.message ?? null,
      commitUrl: commit?.url ?? null, commitAuthor: commit?.author ?? null,
      newVersion: newVersion ?? null, newDownloadUrl: newDownloadUrl ?? null,
      newDescription: newDescription ?? null,
      changesSummary: commit ? `Latest commit on ${link.branch ?? "main"}: ${commit.sha} by ${commit.author}` : "Deployment platform — no commit info available",
    }).returning();

    // Update the link's last-synced info
    if (commit) {
      await db.update(storeAppRepoLinksTable).set({
        lastCommitSha: commit.sha, lastCommitMessage: commit.message,
        lastCommitAuthor: commit.author, lastCommitUrl: commit.url, lastSyncedAt: new Date(),
      }).where(eq(storeAppRepoLinksTable.id, link.id));
    }

    res.status(201).json(serializeUpdateRequest(request, app, dev));
  } catch (err) {
    logger.error({ err }, "requestUpdate error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/apps/:id/update-requests — developer's own request history for one app
router.get("/apps/:id/update-requests", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const appId = parseInt(String(req.params.id));
    const app = await db.query.storeAppsTable.findFirst({ where: and(eq(storeAppsTable.id, appId), eq(storeAppsTable.developerId, dev.id)) });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const requests = await db.query.storeAppUpdateRequestsTable.findMany({
      where: eq(storeAppUpdateRequestsTable.appId, appId),
      orderBy: desc(storeAppUpdateRequestsTable.createdAt),
      limit: 30,
    });
    res.json(requests.map((r) => serializeUpdateRequest(r, app, dev)));
  } catch (err) {
    logger.error({ err }, "myUpdateRequests error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── ADMIN: UPDATE REQUEST ROUTES ─────────────────────────────────────────────

// GET /store/admin/update-requests
router.get("/admin/update-requests", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { status = "pending" } = req.query as Record<string, string>;
    const where = status === "all" ? undefined : eq(storeAppUpdateRequestsTable.status, status);
    const requests = await db.query.storeAppUpdateRequestsTable.findMany({
      where,
      orderBy: desc(storeAppUpdateRequestsTable.createdAt),
      limit: 100,
    });
    // Enrich with app + dev names
    const appIds = [...new Set(requests.map((r) => r.appId))];
    const devIds = [...new Set(requests.map((r) => r.developerId))];
    const [apps, devs] = await Promise.all([
      appIds.length ? db.query.storeAppsTable.findMany({ where: sql`id = ANY(ARRAY[${sql.raw(appIds.join(","))}]::int[])` }) : Promise.resolve([]),
      devIds.length ? db.query.storeDeveloperAccountsTable.findMany({ where: sql`id = ANY(ARRAY[${sql.raw(devIds.join(","))}]::int[])` }) : Promise.resolve([]),
    ]);
    const appMap = Object.fromEntries(apps.map((a) => [a.id, a]));
    const devMap = Object.fromEntries(devs.map((d) => [d.id, d]));
    res.json(requests.map((r) => serializeUpdateRequest(r, appMap[r.appId], devMap[r.developerId])));
  } catch (err) {
    logger.error({ err }, "adminUpdateRequests error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/update-requests/:id/approve
router.post("/admin/update-requests/:id/approve", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    const request = await db.query.storeAppUpdateRequestsTable.findFirst({ where: eq(storeAppUpdateRequestsTable.id, parseInt(String(req.params.id))) });
    if (!request) return void res.status(404).json({ error: "Not found" });
    if (request.status !== "pending") return void res.status(400).json({ error: "Request is not pending" });

    // Apply the update to the app
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (request.newVersion) updates.currentVersion = request.newVersion;
    if (request.newDownloadUrl) updates.downloadUrl = request.newDownloadUrl;
    if (request.newDescription) updates.description = request.newDescription;
    await db.update(storeAppsTable).set(updates as any).where(eq(storeAppsTable.id, request.appId));

    // If approved and app had been rejected/pending, auto-move to pending_review
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.id, request.appId) });
    if (app && app.status === "approved") {
      // Add a version record
      if (request.newVersion) {
        await db.insert(storeAppVersionsTable).values({
          appId: request.appId, version: request.newVersion,
          releaseNotes: request.commitMessage ?? null,
          fileUrl: request.newDownloadUrl ?? null,
        });
      }
    }

    await db.update(storeAppUpdateRequestsTable).set({
      status: "approved", adminUserId: userId, adminNote: req.body.note ?? null, reviewedAt: new Date(),
    } as any).where(eq(storeAppUpdateRequestsTable.id, request.id));

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "approveUpdate error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/update-requests/:id/reject
router.post("/admin/update-requests/:id/reject", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    const request = await db.query.storeAppUpdateRequestsTable.findFirst({ where: eq(storeAppUpdateRequestsTable.id, parseInt(String(req.params.id))) });
    if (!request) return void res.status(404).json({ error: "Not found" });
    if (request.status !== "pending") return void res.status(400).json({ error: "Request is not pending" });
    await db.update(storeAppUpdateRequestsTable).set({
      status: "rejected", adminUserId: userId, adminNote: req.body.note ?? "Did not meet update requirements.", reviewedAt: new Date(),
    } as any).where(eq(storeAppUpdateRequestsTable.id, request.id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "rejectUpdate error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── OFFLINE PAYMENT ROUTES ───────────────────────────────────────────────────

function serializeOfflinePayment(op: any, app?: any, dev?: any) {
  return {
    id: op.id,
    appId: op.appId,
    appName: app?.name ?? null,
    appSlug: app?.slug ?? null,
    developerId: op.developerId,
    developerName: dev?.displayName ?? null,
    developerEmail: dev?.email ?? null,
    proofUrl: op.proofUrl,
    proofNote: op.proofNote ?? null,
    amountPaid: op.amountPaid ?? null,
    bankReference: op.bankReference ?? null,
    status: op.status,
    adminNote: op.adminNote ?? null,
    adminApprovedAt: op.adminApprovedAt?.toISOString() ?? null,
    superNote: op.superNote ?? null,
    superApprovedAt: op.superApprovedAt?.toISOString() ?? null,
    rejectionReason: op.rejectionReason ?? null,
    rejectedAt: op.rejectedAt?.toISOString() ?? null,
    createdAt: op.createdAt.toISOString(),
    updatedAt: op.updatedAt.toISOString(),
  };
}

// POST /store/payments/offline/submit — developer submits proof of offline payment
router.post("/payments/offline/submit", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const { appId, proofUrl, proofNote, amountPaid, bankReference } = req.body;
    if (!appId || !proofUrl) return void res.status(400).json({ error: "appId and proofUrl are required" });

    const app = await db.query.storeAppsTable.findFirst({
      where: and(eq(storeAppsTable.id, parseInt(appId)), eq(storeAppsTable.developerId, dev.id)),
    });
    if (!app) return void res.status(404).json({ error: "App not found" });
    if (app.publishingFeePaid) return void res.status(400).json({ error: "Publishing fee already paid for this app" });

    // Cancel any existing submitted/rejected offline payment for this app
    await db.update(storeOfflinePaymentsTable)
      .set({ status: "cancelled", updatedAt: new Date() } as any)
      .where(and(eq(storeOfflinePaymentsTable.appId, app.id), eq(storeOfflinePaymentsTable.status, "submitted")));

    const [op] = await db.insert(storeOfflinePaymentsTable).values({
      appId: app.id, developerId: dev.id,
      proofUrl, proofNote: proofNote ?? null,
      amountPaid: amountPaid ?? null, bankReference: bankReference ?? null,
    }).returning();

    res.status(201).json(serializeOfflinePayment(op, app, dev));
  } catch (err) {
    logger.error({ err }, "submitOfflinePayment error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/payments/offline/my — developer's offline payment requests
router.get("/payments/offline/my", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const ops = await db.query.storeOfflinePaymentsTable.findMany({
      where: eq(storeOfflinePaymentsTable.developerId, dev.id),
      orderBy: desc(storeOfflinePaymentsTable.createdAt),
      limit: 50,
    });
    const appIds = [...new Set(ops.map((o) => o.appId))];
    const apps = appIds.length
      ? await db.query.storeAppsTable.findMany({ where: sql`id = ANY(ARRAY[${sql.raw(appIds.join(","))}]::int[])` })
      : [];
    const appMap = Object.fromEntries(apps.map((a) => [a.id, a]));
    res.json(ops.map((o) => serializeOfflinePayment(o, appMap[o.appId], dev)));
  } catch (err) {
    logger.error({ err }, "myOfflinePayments error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/admin/offline-payments — admin list
router.get("/admin/offline-payments", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { status = "submitted" } = req.query as Record<string, string>;
    const where = status === "all" ? undefined : eq(storeOfflinePaymentsTable.status, status);
    const ops = await db.query.storeOfflinePaymentsTable.findMany({
      where, orderBy: desc(storeOfflinePaymentsTable.createdAt), limit: 200,
    });
    const appIds = [...new Set(ops.map((o) => o.appId))];
    const devIds = [...new Set(ops.map((o) => o.developerId))];
    const [apps, devs] = await Promise.all([
      appIds.length ? db.query.storeAppsTable.findMany({ where: sql`id = ANY(ARRAY[${sql.raw(appIds.join(","))}]::int[])` }) : Promise.resolve([]),
      devIds.length ? db.query.storeDeveloperAccountsTable.findMany({ where: sql`id = ANY(ARRAY[${sql.raw(devIds.join(","))}]::int[])` }) : Promise.resolve([]),
    ]);
    const appMap = Object.fromEntries(apps.map((a) => [a.id, a]));
    const devMap = Object.fromEntries(devs.map((d) => [d.id, d]));
    res.json(ops.map((o) => serializeOfflinePayment(o, appMap[o.appId], devMap[o.developerId])));
  } catch (err) {
    logger.error({ err }, "adminOfflinePayments error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/offline-payments/:id/admin-approve — first-level admin approval
router.post("/admin/offline-payments/:id/admin-approve", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    const op = await db.query.storeOfflinePaymentsTable.findFirst({ where: eq(storeOfflinePaymentsTable.id, parseInt(String(req.params.id))) });
    if (!op) return void res.status(404).json({ error: "Not found" });
    if (op.status !== "submitted") return void res.status(400).json({ error: "Payment is not in submitted state" });
    await db.update(storeOfflinePaymentsTable).set({
      status: "admin_approved",
      adminApprovedByClerkId: userId,
      adminApprovedAt: new Date(),
      adminNote: req.body.note ?? null,
      updatedAt: new Date(),
    } as any).where(eq(storeOfflinePaymentsTable.id, op.id));
    res.json({ ok: true, message: "First-level approval done. Awaiting super admin final approval." });
  } catch (err) {
    logger.error({ err }, "adminApproveOfflinePayment error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/offline-payments/:id/super-approve — super admin final approval
router.post("/admin/offline-payments/:id/super-approve", requireAuth(), async (req, res) => {
  try {
    if (!(await isSuperAdmin(req))) return void res.status(403).json({ error: "Super admin only" });
    const { userId } = getAuth(req);
    const op = await db.query.storeOfflinePaymentsTable.findFirst({ where: eq(storeOfflinePaymentsTable.id, parseInt(String(req.params.id))) });
    if (!op) return void res.status(404).json({ error: "Not found" });
    if (op.status !== "admin_approved") return void res.status(400).json({ error: "Payment must be admin-approved before super approval" });

    // Mark offline payment as super approved
    await db.update(storeOfflinePaymentsTable).set({
      status: "super_approved",
      superApprovedByClerkId: userId,
      superApprovedAt: new Date(),
      superNote: req.body.note ?? null,
      updatedAt: new Date(),
    } as any).where(eq(storeOfflinePaymentsTable.id, op.id));

    // Mark the app's publishing fee as paid and move to review.
    // Also clear trial flags so a previously-suspended trial app is fully restored.
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.id, op.appId) });
    if (app && !app.publishingFeePaid) {
      await db.update(storeAppsTable).set({
        publishingFeePaid: true,
        publishingFeeGateway: "offline",
        status: "pending_review",
        trialUpload: false,
        trialSuspendedAt: null,
        updatedAt: new Date(),
      } as any).where(eq(storeAppsTable.id, op.appId));
    }

    res.json({ ok: true, message: "Final approval granted. App moved to pending review." });
  } catch (err) {
    logger.error({ err }, "superApproveOfflinePayment error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/offline-payments/:id/reject — reject offline payment proof
router.post("/admin/offline-payments/:id/reject", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    const op = await db.query.storeOfflinePaymentsTable.findFirst({ where: eq(storeOfflinePaymentsTable.id, parseInt(String(req.params.id))) });
    if (!op) return void res.status(404).json({ error: "Not found" });
    if (!["submitted", "admin_approved"].includes(op.status)) return void res.status(400).json({ error: "Cannot reject in current state" });
    await db.update(storeOfflinePaymentsTable).set({
      status: "rejected",
      rejectedByClerkId: userId,
      rejectedAt: new Date(),
      rejectionReason: req.body.reason ?? "Proof of payment not accepted.",
      updatedAt: new Date(),
    } as any).where(eq(storeOfflinePaymentsTable.id, op.id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "rejectOfflinePayment error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PLATFORM APPS (first-party Awajimaa apps) ────────────────────────────────
//
// Platform apps are published by Awajimaa itself — no publishing fee, no review
// queue. Admins upload APKs (or any binary) directly; the file is stored in
// object storage and the public URL becomes the download link, exactly like a
// Google Play / App Store direct link.

const _apkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB max
});

const PLATFORM_DEV_CLERK_ID = "platform:awajimaa";

async function getOrCreatePlatformDeveloper() {
  const existing = await db.query.storeDeveloperAccountsTable.findFirst({
    where: eq(storeDeveloperAccountsTable.clerkUserId, PLATFORM_DEV_CLERK_ID),
  });
  if (existing) return existing;
  const [dev] = await db.insert(storeDeveloperAccountsTable).values({
    clerkUserId: PLATFORM_DEV_CLERK_ID,
    displayName: "Awajimaa",
    email: "apps@awajimaaapp.io",
    company: "Lumgwun Solutions Group",
    country: "Nigeria",
    status: "active",
  } as any).returning();
  return dev;
}

function _slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

/**
 * POST /store/admin/platform-apps/upload-file
 * Upload any file (APK, image, screenshot) to object storage.
 * Returns { url, fileName, fileSize, mimeType }.
 */
router.post(
  "/admin/platform-apps/upload-file",
  requireAuth(),
  _apkUpload.single("file"),
  async (req: any, res: any) => {
    try {
      if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
      if (!req.file) return void res.status(400).json({ error: "No file provided" });
      const { buffer, mimetype, originalname, size } = req.file;

      // Upload to object storage, then build the public URL from the *request* host
      // so the link always uses the correct custom domain (awajimaaappstore.com in
      // production) rather than the dev-tunnel hostname that PUBLIC_APP_DOMAIN /
      // REPLIT_DEV_DOMAIN would otherwise produce.
      const _objStorage = new ObjectStorageService();
      const uploadUrl = await _objStorage.getObjectEntityUploadURL();
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mimetype },
        body: buffer as unknown as Uint8Array,
      });
      if (!putRes.ok) throw new Error(`Object storage upload failed (${putRes.status})`);
      const objectPath = _objStorage.normalizeObjectEntityPath(uploadUrl);
      await _objStorage.trySetObjectEntityAclPolicy(objectPath, { owner: "system:store-apk", visibility: "public" });
      const objectId = objectPath.replace(/^\/objects\/uploads\//, "");

      // Use the same host-derivation pattern as getBaseUrl() so the link works on
      // the custom domain in production and on localhost in dev.
      const proto = (req.get("x-forwarded-proto") as string | undefined) ?? req.protocol ?? "https";
      const host  = req.get("host") as string;
      const replitUrl = `${proto}://${host}/api/media/${objectId}`;

      // Mirror to GCS for permanent hosting (icons, screenshots, APKs).
      let publicUrl = replitUrl;
      if (isR2Configured()) {
        try {
          publicUrl = await uploadBufferToR2(buffer, originalname || "file", mimetype, "app-store/media");
        } catch (gcsErr) {
          logger.warn({ gcsErr }, "platform-apps upload-file: GCS mirror failed — using Replit URL");
          publicUrl = replitUrl;
        }
      }

      res.json({ url: publicUrl, fileName: originalname, fileSize: size, mimeType: mimetype });
    } catch (err) {
      logger.error({ err }, "platform-apps: upload-file error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

/**
/**
 * GET /store/download/:publicId  — PUBLIC, no auth.
 * Increments totalDownloads atomically then 302-redirects to the real file URL.
 * The raw storage URL is never exposed to the client.
 */
router.get("/download/:publicId", async (req: any, res: any) => {
  try {
    const app = await db.query.storeAppsTable.findFirst({
      where: eq((storeAppsTable as any).publicId, String(req.params.publicId)),
    });
    if (!app || app.status !== "approved") {
      return void res.status(404).json({ error: "App not found" });
    }
    // Atomic download counter increment
    await db
      .update(storeAppsTable)
      .set({ totalDownloads: sql`${storeAppsTable.totalDownloads} + 1` })
      .where(eq(storeAppsTable.id, app.id));
    // Fire-and-forget event log
    logAppEvent(app.id, "download", req);
    res.redirect(302, app.downloadUrl);
  } catch (err) {
    logger.error({ err }, "store: download redirect error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /store/p/:publicId  — PUBLIC, no auth.
 * Returns full app detail by publicId for the canonical landing page.
 */
router.get("/p/:publicId", async (req: any, res: any) => {
  try {
    const app = await db.query.storeAppsTable.findFirst({
      where: eq((storeAppsTable as any).publicId, String(req.params.publicId)),
    });
    if (!app || app.status !== "approved") {
      return void res.status(404).json({ error: "App not found" });
    }
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.id, app.developerId),
    });
    res.json(serializeApp(app, dev));
  } catch (err) {
    logger.error({ err }, "store: app by publicId error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /store/admin/platform-apps
 * List all first-party platform apps (including removed ones).
 */
router.get("/admin/platform-apps", requireAuth(), async (req: any, res: any) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const apps = await db
      .select()
      .from(storeAppsTable)
      .where(eq((storeAppsTable as any).isPlatformApp, true))
      .orderBy(desc(storeAppsTable.createdAt));
    res.json(apps.map(a => ({ ...a, publicUrl: publicAppUrl((a as any).publicId) })));
  } catch (err) {
    logger.error({ err }, "platform-apps: list error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /store/admin/platform-apps
 * Create a new first-party app — auto-approved, fee-exempt.
 */
router.post("/admin/platform-apps", requireAuth(), async (req: any, res: any) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { name, tagline, description, categories: rawCategories, category: singleCategory, platform, iconUrl, screenshots, downloadUrl, webUrl, currentVersion, packageName } = req.body;
    const categories: string[] = Array.isArray(rawCategories) && rawCategories.length > 0
      ? rawCategories.slice(0, 5).filter(Boolean)
      : singleCategory ? [String(singleCategory)] : [];
    const category = categories[0] ?? null;
    if (!name || !tagline || !description || !category || !iconUrl || !downloadUrl) {
      return void res.status(400).json({ error: "name, tagline, description, at least one category, iconUrl, and downloadUrl are required" });
    }
    const dev = await getOrCreatePlatformDeveloper();
    let slug = _slugify(name);
    const clash = await db.select({ id: storeAppsTable.id }).from(storeAppsTable).where(eq(storeAppsTable.slug, slug));
    if (clash.length) slug = `${slug}-${Date.now()}`;
    const { userId: adminClerkId } = getAuth(req);

    // Mirror the APK to GCS for permanent hosting before persisting the URL
    let finalDownloadUrl = downloadUrl;
    if (isR2Configured()) {
      try {
        finalDownloadUrl = await mirrorUrlToR2(downloadUrl);
        logger.info({ gcsUrl: finalDownloadUrl }, "platform-app APK mirrored to GCS");
      } catch (gcsErr) {
        logger.warn({ err: gcsErr }, "GCS mirror failed for platform-app — keeping original URL");
      }
    }

    const [app] = await db.insert(storeAppsTable).values({
      developerId: dev.id,
      name, slug, tagline, description, category, categories,
      platform: platform ?? "android",
      iconUrl,
      screenshots: screenshots ?? [],
      downloadUrl: finalDownloadUrl,
      webUrl: webUrl ?? null,
      currentVersion: currentVersion ?? null,
      packageName: packageName ?? null,
      status: "approved",
      publishingFeePaid: true,
      isPlatformApp: true,
      isFeatured: false,
      publicId: generatePublicId("platform"),
    } as any).returning();

    // Auto-create the initial version record and mark it live
    if (finalDownloadUrl) {
      await db.insert(storeAppVersionsTable).values({
        appId: app.id,
        version: currentVersion ?? "1.0.0",
        versionCode: 1,
        fileUrl: finalDownloadUrl,
        uploadedByClerkId: adminClerkId,
        status: "live",
        activatedAt: new Date(),
        activatedByClerkId: adminClerkId,
      } as any);
    }

    res.status(201).json({ ...app, publicUrl: publicAppUrl((app as any).publicId), canonicalDownloadUrl: canonicalDownloadUrl(app) });
  } catch (err) {
    logger.error({ err }, "platform-apps: create error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PATCH /store/admin/platform-apps/:id
 * Update a platform app's metadata or URLs.
 */
router.patch("/admin/platform-apps/:id", requireAuth(), async (req: any, res: any) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { userId: adminClerkId } = getAuth(req);
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.id, id) });
    if (!app || !(app as any).isPlatformApp) return void res.status(404).json({ error: "Platform app not found" });
    const allowed = ["name","tagline","description","category","categories","platform","iconUrl","screenshots","downloadUrl","webUrl","currentVersion","packageName","isFeatured","status"] as const;
    const updates: any = { updatedAt: new Date() };
    for (const key of allowed) { if (req.body[key] !== undefined) updates[key] = req.body[key]; }
    const [updated] = await db.update(storeAppsTable).set(updates).where(eq(storeAppsTable.id, id)).returning();

    // If a new downloadUrl was supplied and it differs from the previous one, create a new version record
    const newDownloadUrl = req.body.downloadUrl;
    const newVersion = req.body.currentVersion;
    if (newDownloadUrl && newDownloadUrl !== app.downloadUrl) {
      const [{ maxCode }] = await db.select({ maxCode: sql<number>`COALESCE(MAX(version_code), 0)` })
        .from(storeAppVersionsTable).where(eq(storeAppVersionsTable.appId, id));
      // Deprecate any currently live version
      await db.update(storeAppVersionsTable).set({ status: "deprecated" })
        .where(and(eq(storeAppVersionsTable.appId, id), eq(storeAppVersionsTable.status, "live")));
      // Create the new live version
      const now = new Date();
      await db.insert(storeAppVersionsTable).values({
        appId: id,
        version: newVersion ?? app.currentVersion ?? "1.0.0",
        versionCode: maxCode + 1,
        fileUrl: newDownloadUrl,
        uploadedByClerkId: adminClerkId,
        status: "live",
        activatedAt: now,
        activatedByClerkId: adminClerkId,
      } as any);
    }

    res.json({ ...updated, canonicalDownloadUrl: canonicalDownloadUrl(updated) });
  } catch (err) {
    logger.error({ err }, "platform-apps: update error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── UPLOAD TRIAL ADMIN ROUTES ────────────────────────────────────────────────

// GET /store/admin/upload-trials — all grants (active + expired + revoked) with developer info + trial-app counts
router.get("/admin/upload-trials", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });

    const trials = await db.query.storeUploadTrialsTable.findMany({
      orderBy: desc(storeUploadTrialsTable.createdAt),
      with: { developer: true } as any,
    });

    const now = new Date();
    const result = await Promise.all(trials.map(async (t: any) => {
      const dev = t.developer as any;
      // Count trial apps for this developer
      const trialApps = await db
        .select({ id: storeAppsTable.id, name: storeAppsTable.name, status: storeAppsTable.status, publishingFeePaid: storeAppsTable.publishingFeePaid })
        .from(storeAppsTable)
        .where(and(
          eq(storeAppsTable.developerId, t.developerId),
          eq(storeAppsTable.trialUpload as any, true),
        ));
      return {
        id: t.id,
        developerId: t.developerId,
        developerName: dev?.displayName ?? "Unknown",
        developerEmail: dev?.email ?? "",
        expiresAt: t.expiresAt.toISOString(),
        grantedByAdminId: t.grantedByAdminId ?? null,
        revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
        note: t.note ?? null,
        createdAt: t.createdAt.toISOString(),
        active: !t.revokedAt && t.expiresAt > now,
        expired: !t.revokedAt && t.expiresAt <= now,
        trialApps: trialApps.map(a => ({ id: a.id, name: a.name, status: a.status, publishingFeePaid: a.publishingFeePaid })),
      };
    }));

    res.json(result);
  } catch (err) {
    logger.error({ err }, "getUploadTrials error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/upload-trials — grant a developer a trial upload window
router.post("/admin/upload-trials", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    const { developerId, days, note } = req.body as { developerId?: number; days?: number; note?: string };

    if (!developerId || typeof developerId !== "number") {
      return void res.status(400).json({ error: "developerId (number) required" });
    }
    const daysNum = typeof days === "number" && days > 0 && days <= 365 ? days : 7;

    const dev = await db.query.storeDeveloperAccountsTable.findFirst({ where: eq(storeDeveloperAccountsTable.id, developerId) });
    if (!dev) return void res.status(404).json({ error: "Developer not found" });

    // Revoke any existing active trial first
    const existingActive = await db.query.storeUploadTrialsTable.findFirst({
      where: and(
        eq(storeUploadTrialsTable.developerId, developerId),
        isNull(storeUploadTrialsTable.revokedAt),
        gte(storeUploadTrialsTable.expiresAt, new Date()),
      ),
    });
    if (existingActive) {
      await db.update(storeUploadTrialsTable).set({ revokedAt: new Date() }).where(eq(storeUploadTrialsTable.id, existingActive.id));
    }

    const expiresAt = new Date(Date.now() + daysNum * 24 * 60 * 60 * 1000);
    const [trial] = await db.insert(storeUploadTrialsTable).values({
      developerId,
      expiresAt,
      grantedByAdminId: userId ?? null,
      note: typeof note === "string" && note.trim() ? note.trim() : null,
    }).returning();

    // Notify developer by email — best-effort
    if (dev.email) {
      const html = wrapVendorEmail({
        bodyHtml: `
          <h1 style="text-align:center;font-size:20px;color:#1a1a1a;margin:0 0 16px;">🎉 Trial upload access granted</h1>
          <p style="font-size:14px;line-height:1.6;color:#444;">Hi ${escapeHtml(dev.displayName ?? "there")},</p>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            You've been granted a <strong>${daysNum}-day</strong> trial upload window on the Awajimaa App Store.
            You can submit your app now and pay the publishing fee later — before
            <strong>${expiresAt.toLocaleDateString()}</strong>.
          </p>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            If payment isn't received by the deadline, your app will be suspended until payment is completed.
          </p>
          <p style="font-size:14px;line-height:1.6;color:#444;">
            Head to your <a href="https://awajimaaappstore.com/app-store/developer" style="color:#00c853;">Developer Portal</a> to submit your app.
          </p>
        `,
      });
      sendEmail({ to: dev.email, subject: `You've been granted trial upload access to the Awajimaa App Store`, html }).catch(() => {});
    }

    res.status(201).json({ ok: true, trialId: trial.id, expiresAt: trial.expiresAt.toISOString() });
  } catch (err) {
    logger.error({ err }, "grantUploadTrial error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /store/admin/upload-trials/:id — revoke trial + immediately suspend unpaid trial apps
router.delete("/admin/upload-trials/:id", requireAuth(), async (req, res) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const trialId = parseInt(String(req.params.id), 10);
    if (isNaN(trialId)) return void res.status(400).json({ error: "Invalid id" });

    const trial = await db.query.storeUploadTrialsTable.findFirst({ where: eq(storeUploadTrialsTable.id, trialId) });
    if (!trial) return void res.status(404).json({ error: "Trial not found" });
    if (trial.revokedAt) return void res.status(409).json({ error: "Trial already revoked" });

    const now = new Date();
    await db.update(storeUploadTrialsTable).set({ revokedAt: now }).where(eq(storeUploadTrialsTable.id, trialId));

    // Suspend unpaid trial apps for this developer
    const unpaidApps = await db
      .select({ id: storeAppsTable.id, name: storeAppsTable.name })
      .from(storeAppsTable)
      .where(and(
        eq(storeAppsTable.developerId, trial.developerId),
        eq(storeAppsTable.trialUpload as any, true),
        eq(storeAppsTable.publishingFeePaid, false),
      ));

    for (const app of unpaidApps) {
      await db.update(storeAppsTable)
        .set({ status: "suspended", trialSuspendedAt: now, updatedAt: now } as any)
        .where(eq(storeAppsTable.id, app.id));
    }

    // Notify developer — best-effort
    if (unpaidApps.length > 0) {
      const dev = await db.query.storeDeveloperAccountsTable.findFirst({ where: eq(storeDeveloperAccountsTable.id, trial.developerId) });
      if (dev?.email) {
        const appList = unpaidApps.map(a => `<li>${escapeHtml(a.name)}</li>`).join("");
        const html = wrapVendorEmail({
          bodyHtml: `
            <h1 style="text-align:center;font-size:20px;color:#1a1a1a;margin:0 0 16px;">⚠️ Trial access revoked</h1>
            <p style="font-size:14px;line-height:1.6;color:#444;">Hi ${escapeHtml(dev.displayName ?? "there")},</p>
            <p style="font-size:14px;line-height:1.6;color:#444;">
              Your trial upload access on the Awajimaa App Store has been revoked by an administrator.
              The following app${unpaidApps.length > 1 ? "s have" : " has"} been suspended:
            </p>
            <ul style="font-size:14px;color:#444;padding-left:20px;margin:12px 0;">${appList}</ul>
            <p style="font-size:14px;line-height:1.6;color:#444;">
              To restore ${unpaidApps.length > 1 ? "them" : "it"}, complete the publishing fee payment from your
              <a href="https://awajimaaappstore.com/app-store/developer" style="color:#00c853;">Developer Portal</a>.
            </p>
          `,
        });
        sendEmail({ to: dev.email, subject: `Trial upload access revoked — publishing fee required`, html }).catch(() => {});
      }
    }

    res.json({ ok: true, suspended: unpaidApps.length });
  } catch (err) {
    logger.error({ err }, "revokeUploadTrial error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /store/admin/platform-apps/:id
 * Remove a platform app (sets status = "removed").
 */
router.delete("/admin/platform-apps/:id", requireAuth(), async (req: any, res: any) => {
  try {
    if (!(await checkIsAdmin(req))) return void res.status(403).json({ error: "Admin only" });
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.id, id) });
    if (!app || !(app as any).isPlatformApp) return void res.status(404).json({ error: "Platform app not found" });
    await db.update(storeAppsTable).set({ status: "removed", updatedAt: new Date() } as any).where(eq(storeAppsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "platform-apps: delete error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

// ─── Startup data-fix: update Awajimaa App to v1.1.0 + add screenshots ───────
// Idempotent — checks current state before writing. Safe to leave in place.
(async function fixAwajimaaApp() {
  try {
    const NEW_APK   = "https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/app-store/downloads/1785998121011-5f7efea146a67a03.apk";
    const NEW_VER   = "1.1.0";
    const ICON_URL  = "https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/app-store/icons/awajimaa-app-icon.jpg";
    const SCREENSHOTS = [
      "https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/app-store/screenshots/1785998126505-0f2bef00a96a48d7.png",
      "https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/app-store/screenshots/1785998127620-6eb9d626d461c5d7.png",
      "https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/app-store/screenshots/1785998128643-b1dc11426145aa0b.png",
      "https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/app-store/screenshots/1785998129557-fea6246049d4310a.png",
      "https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/app-store/screenshots/1785998130444-4ceab2ac236c7a07.png",
      "https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/app-store/screenshots/1785998131455-6bfcadffa2980d1a.png",
    ];

    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.id, 1) });
    if (!app) return;

    // 1. Deprecate old live versions FIRST (before inserting new live row)
    await db.update(storeAppVersionsTable)
      .set({ status: "deprecated" } as any)
      .where(and(eq(storeAppVersionsTable.appId, 1), sql`version != ${NEW_VER}`, eq(storeAppVersionsTable.status, "live")));

    // 2. Register/update v1.1.0
    const existing = await db.query.storeAppVersionsTable.findFirst({
      where: and(eq(storeAppVersionsTable.appId, 1), eq(storeAppVersionsTable.version, NEW_VER)),
    });
    if (!existing) {
      await db.insert(storeAppVersionsTable).values({
        appId: 1,
        version: NEW_VER,
        fileUrl: NEW_APK,
        fileSize: 109051904, // ~104 MB
        status: "live",
        activatedAt: new Date(),
      } as any);
      logger.info("[store-fix] Registered Awajimaa App v1.1.0");
    } else if (existing.status !== "live" || existing.fileUrl !== NEW_APK) {
      await db.update(storeAppVersionsTable)
        .set({ status: "live", fileUrl: NEW_APK, activatedAt: new Date() } as any)
        .where(eq(storeAppVersionsTable.id, existing.id));
      logger.info("[store-fix] Updated Awajimaa App v1.1.0 to live");
    }

    // 3. Sync app-level download_url + version label + screenshots + icon + status
    const currentScreenshots = (app as any).screenshots as string[] ?? [];
    const needsScreenshots = currentScreenshots.length < SCREENSHOTS.length;
    const badUrl = (app as any).downloadUrl !== NEW_APK;
    const badIcon = (app as any).iconUrl !== ICON_URL;
    const badStatus = (app as any).status !== "approved";  // must never be 'live'
    if (badUrl || needsScreenshots || badIcon || badStatus) {
      await db.update(storeAppsTable)
        .set({
          downloadUrl: NEW_APK,
          currentVersion: NEW_VER,
          screenshots: SCREENSHOTS,
          iconUrl: ICON_URL,
          status: "approved",
          updatedAt: new Date(),
        } as any)
        .where(eq(storeAppsTable.id, 1));
      logger.info("[store-fix] Updated Awajimaa App download_url + screenshots + icon + status");
    }
  } catch (err) {
    logger.warn({ err }, "[store-fix] Could not run Awajimaa App fix — will retry on next restart");
  }
})();
