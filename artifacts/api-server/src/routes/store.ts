import { Router } from "express";
import { db } from "@workspace/db";
import {
  storeAppsTable,
  storeDeveloperAccountsTable,
  storeAppVersionsTable,
  storeAppReviewsTable,
  storeLinkedAccountsTable,
  storeAppRepoLinksTable,
  storeAppUpdateRequestsTable,
} from "@workspace/db";
import { eq, desc, asc, ilike, and, sql, or } from "drizzle-orm";
import { requireAuth, getAuth } from "@clerk/express";
import { logger } from "../lib/logger";
import crypto from "crypto";

const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────

const PUBLISHING_FEE_KOBO = 2_500_000; // NGN 25,000
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? "";
const IS_MERCHANT_CODE = process.env.INTERSWITCH_MERCHANT_CODE ?? "";
const IS_PAY_ITEM_ID = process.env.INTERSWITCH_PAY_ITEM_ID ?? "";
const IS_SECRET_KEY = process.env.INTERSWITCH_SECRET_KEY ?? "";
const IS_CLIENT_ID = process.env.INTERSWITCH_CLIENT_ID ?? "";

function getBaseUrl(req: any): string {
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) return `https://${dev}`;
  return `${req.protocol}://${req.get("host")}`;
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

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function serializeApp(app: any, developer?: any) {
  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    tagline: app.tagline,
    description: app.description,
    category: app.category,
    platform: app.platform,
    iconUrl: app.iconUrl,
    screenshots: (app.screenshots as string[]) ?? [],
    downloadUrl: app.downloadUrl ?? null,
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

async function requireDeveloper(req: any, res: any) {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const dev = await db.query.storeDeveloperAccountsTable.findFirst({
    where: eq(storeDeveloperAccountsTable.clerkUserId, userId),
  });
  if (!dev) { res.status(404).json({ error: "Developer account not found. Register first." }); return null; }
  if (dev.status !== "active") { res.status(403).json({ error: "Developer account is suspended." }); return null; }
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
      where: and(eq(storeAppsTable.slug, req.params.slug), eq(storeAppsTable.status, "approved")),
      with: { developer: true },
    });
    if (!app) return void res.status(404).json({ error: "App not found" });
    res.json(serializeApp(app, (app as any).developer));
  } catch (err) {
    logger.error({ err }, "getStoreApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/apps/:slug/download — increment counter + return download URL
router.post("/apps/:slug/download", async (req, res) => {
  try {
    const app = await db.query.storeAppsTable.findFirst({
      where: and(eq(storeAppsTable.slug, req.params.slug), eq(storeAppsTable.status, "approved")),
    });
    if (!app) return void res.status(404).json({ error: "App not found" });
    await db.update(storeAppsTable).set({ totalDownloads: app.totalDownloads + 1 }).where(eq(storeAppsTable.id, app.id));
    res.json({ downloadUrl: app.downloadUrl ?? "", webUrl: app.webUrl ?? null });
  } catch (err) {
    logger.error({ err }, "downloadApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/apps/:slug/reviews
router.get("/apps/:slug/reviews", async (req, res) => {
  try {
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.slug, req.params.slug) });
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
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.slug, req.params.slug) });
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

// GET /store/apps/:slug/versions
router.get("/apps/:slug/versions", async (req, res) => {
  try {
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.slug, req.params.slug) });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const versions = await db.query.storeAppVersionsTable.findMany({
      where: eq(storeAppVersionsTable.appId, app.id),
      orderBy: desc(storeAppVersionsTable.createdAt),
    });
    res.json(versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })));
  } catch (err) {
    logger.error({ err }, "listVersions error");
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

    const [dev] = await db.insert(storeDeveloperAccountsTable).values({
      clerkUserId: userId!,
      displayName,
      email,
      bio: bio ?? null,
      website: website ?? null,
      company: company ?? null,
      country: country ?? "Nigeria",
      status: "active",
      registrationFeePaid: true,
      paystackCustomerCode: customerCode ?? null,
      dedicatedNgnAccount: dedicatedNgnAccount,
    } as any).returning();

    res.status(201).json({ ...serializeDev(dev), totalApps: 0, totalDownloads: 0 });
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
    const { name, tagline, description, category, platform, iconUrl, screenshots, downloadUrl, webUrl, currentVersion } = req.body;
    if (!name || !tagline || !description || !category || !platform || !iconUrl) {
      return void res.status(400).json({ error: "name, tagline, description, category, platform, iconUrl are required" });
    }
    if (!downloadUrl) return void res.status(400).json({ error: "downloadUrl is required — every app must have a direct download or install link" });

    let slug = slugify(name);
    const existing = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.slug, slug) });
    if (existing) slug = `${slug}-${Date.now()}`;

    const [app] = await db.insert(storeAppsTable).values({
      developerId: dev.id,
      name, slug, tagline, description, category, platform, iconUrl,
      screenshots: screenshots ?? [],
      downloadUrl,
      webUrl: webUrl ?? null,
      currentVersion: currentVersion ?? null,
      status: "pending_payment",
      publishingFeePaid: false,
      publishingFeeAmountKobo: PUBLISHING_FEE_KOBO,
    } as any).returning();
    res.status(201).json(serializeApp(app, dev));
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
    const appId = parseInt(req.params.id);
    const app = await db.query.storeAppsTable.findFirst({ where: and(eq(storeAppsTable.id, appId), eq(storeAppsTable.developerId, dev.id)) });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const { tagline, description, category, platform, iconUrl, screenshots, downloadUrl, webUrl, currentVersion } = req.body;
    const [updated] = await db.update(storeAppsTable).set({
      tagline: tagline ?? app.tagline,
      description: description ?? app.description,
      category: category ?? app.category,
      platform: platform ?? app.platform,
      iconUrl: iconUrl ?? app.iconUrl,
      screenshots: screenshots ?? app.screenshots,
      downloadUrl: downloadUrl ?? app.downloadUrl,
      webUrl: webUrl ?? app.webUrl,
      currentVersion: currentVersion ?? app.currentVersion,
      updatedAt: new Date(),
    }).where(eq(storeAppsTable.id, appId)).returning();
    res.json(serializeApp(updated, dev));
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
    const appId = parseInt(req.params.id);
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
    const appId = parseInt(req.params.id);
    const app = await db.query.storeAppsTable.findFirst({ where: and(eq(storeAppsTable.id, appId), eq(storeAppsTable.developerId, dev.id)) });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const { version, releaseNotes, downloadUrl } = req.body;
    if (!version) return void res.status(400).json({ error: "version is required" });
    const [v] = await db.insert(storeAppVersionsTable).values({
      appId,
      version,
      releaseNotes: releaseNotes ?? null,
      downloadUrl: downloadUrl ?? null,
    }).returning();
    if (downloadUrl) await db.update(storeAppsTable).set({ currentVersion: version, downloadUrl, updatedAt: new Date() }).where(eq(storeAppsTable.id, appId));
    res.status(201).json({ ...v, createdAt: v.createdAt.toISOString() });
  } catch (err) {
    logger.error({ err }, "addVersion error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PAYMENT ROUTES ─────────────────────────────────────────────────────────────

// POST /store/payments/initiate — NGN 25,000 app publishing fee
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
      res.json({ gateway: "paystack", authorizationUrl: txn.authorization_url, reference: txn.reference });

    } else if (gateway === "interswitch") {
      const txnRef = `AFST-${app.id}-${Date.now()}`;
      const redirectUrl = `${baseUrl}/api/store/payments/interswitch/callback`;
      const { paymentUrl, formData } = buildInterswitchFormData(txnRef, redirectUrl);
      await db.update(storeAppsTable)
        .set({ publishingFeeRef: txnRef, publishingFeeGateway: "interswitch", publishingFeeAmountKobo: PUBLISHING_FEE_KOBO, updatedAt: new Date() } as any)
        .where(eq(storeAppsTable.id, app.id));
      res.json({ gateway: "interswitch", paymentUrl, formData, appId: app.id });

    } else {
      res.status(400).json({ error: "gateway must be 'paystack' or 'interswitch'" });
    }
  } catch (err) {
    logger.error({ err }, "initiatePayment error");
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
        .set({ publishingFeePaid: true, status: "pending_review", updatedAt: new Date() } as any)
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
            .set({ publishingFeePaid: true, status: "pending_review", updatedAt: new Date() } as any)
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
          .set({ publishingFeePaid: true, status: "pending_review", updatedAt: new Date() } as any)
          .where(eq(storeAppsTable.id, app.id));
        logger.info({ appId: app.id, reference: data.reference }, "[store] App publishing fee confirmed via Paystack webhook");
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

// ─── ADMIN ROUTES ──────────────────────────────────────────────────────────────

// GET /store/admin/stats
router.get("/admin/stats", requireAuth(), async (req, res) => {
  try {
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
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
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
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
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
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
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.id, parseInt(req.params.id)) });
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
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    await db.update(storeAppsTable).set({
      status: "approved",
      reviewedByClerkId: userId,
      reviewedAt: new Date(),
      rejectionReason: null,
      updatedAt: new Date(),
    } as any).where(eq(storeAppsTable.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "approveApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/apps/:id/reject
router.post("/admin/apps/:id/reject", requireAuth(), async (req, res) => {
  try {
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    const { reason } = req.body;
    await db.update(storeAppsTable).set({
      status: "rejected",
      reviewedByClerkId: userId,
      reviewedAt: new Date(),
      rejectionReason: reason ?? "Did not meet store guidelines",
      updatedAt: new Date(),
    } as any).where(eq(storeAppsTable.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "rejectApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/apps/:id/feature
router.post("/admin/apps/:id/feature", requireAuth(), async (req, res) => {
  try {
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.id, parseInt(req.params.id)) });
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
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
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
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({ where: eq(storeDeveloperAccountsTable.id, parseInt(req.params.id)) });
    if (!dev) return void res.status(404).json({ error: "Not found" });
    const newStatus = dev.status === "active" ? "suspended" : "active";
    await db.update(storeDeveloperAccountsTable).set({ status: newStatus, suspensionReason: req.body.reason ?? null, updatedAt: new Date() } as any).where(eq(storeDeveloperAccountsTable.id, dev.id));
    res.json({ status: newStatus });
  } catch (err) {
    logger.error({ err }, "suspendDeveloper error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/admin/apps/:id/assign-download
router.post("/admin/apps/:id/assign-download", requireAuth(), async (req, res) => {
  try {
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const { downloadUrl } = req.body;
    if (!downloadUrl) return void res.status(400).json({ error: "downloadUrl required" });
    await db.update(storeAppsTable).set({ downloadUrl, updatedAt: new Date() } as any).where(eq(storeAppsTable.id, parseInt(req.params.id)));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "assignDownload error");
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
    const appId = parseInt(req.params.id);
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
    const appId = parseInt(req.params.id);
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
    const appId = parseInt(req.params.id);
    const app = await db.query.storeAppsTable.findFirst({ where: and(eq(storeAppsTable.id, appId), eq(storeAppsTable.developerId, dev.id)) });
    if (!app) return void res.status(404).json({ error: "Not found" });

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
    const appId = parseInt(req.params.id);
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
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
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
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    const request = await db.query.storeAppUpdateRequestsTable.findFirst({ where: eq(storeAppUpdateRequestsTable.id, parseInt(req.params.id)) });
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
          downloadUrl: request.newDownloadUrl ?? null,
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
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    const request = await db.query.storeAppUpdateRequestsTable.findFirst({ where: eq(storeAppUpdateRequestsTable.id, parseInt(req.params.id)) });
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

export default router;
