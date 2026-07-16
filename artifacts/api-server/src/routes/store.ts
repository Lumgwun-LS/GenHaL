import { Router } from "express";
import { db } from "@workspace/db";
import {
  storeAppsTable,
  storeDeveloperAccountsTable,
  storeAppVersionsTable,
  storeAppReviewsTable,
} from "@workspace/db";
import { eq, desc, asc, ilike, and, sql, or } from "drizzle-orm";
import { requireAuth, getAuth } from "@clerk/express";
import { logger } from "../lib/logger";
import Stripe from "stripe";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function serializeApp(app: typeof storeAppsTable.$inferSelect, developer?: typeof storeDeveloperAccountsTable.$inferSelect | null) {
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

function serializeAppSummary(app: typeof storeAppsTable.$inferSelect, developerName = "Unknown") {
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
    developerName,
    createdAt: app.createdAt.toISOString(),
  };
}

function isAdmin(req: any): boolean {
  const { userId } = getAuth(req);
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  return !!userId && adminIds.includes(userId);
}

async function requireDeveloper(req: any, res: any): Promise<typeof storeDeveloperAccountsTable.$inferSelect | null> {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const dev = await db.query.storeDeveloperAccountsTable.findFirst({
    where: eq(storeDeveloperAccountsTable.clerkUserId, userId),
  });
  if (!dev) { res.status(404).json({ error: "Developer account not found" }); return null; }
  if (dev.status !== "active") { res.status(403).json({ error: "Developer account not active" }); return null; }
  return dev;
}

// ─── CATEGORY config ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { name: "Productivity", iconEmoji: "⚡" },
  { name: "Finance", iconEmoji: "💰" },
  { name: "Education", iconEmoji: "📚" },
  { name: "Health & Fitness", iconEmoji: "🏃" },
  { name: "Entertainment", iconEmoji: "🎮" },
  { name: "Social", iconEmoji: "🤝" },
  { name: "Business", iconEmoji: "💼" },
  { name: "Utilities", iconEmoji: "🔧" },
  { name: "Lifestyle", iconEmoji: "🌟" },
  { name: "Shopping", iconEmoji: "🛒" },
  { name: "Travel", iconEmoji: "✈️" },
  { name: "Food & Drink", iconEmoji: "🍔" },
  { name: "Other", iconEmoji: "📦" },
];

// ─── PUBLIC ROUTES ─────────────────────────────────────────────────────────────

// GET /store/apps — browse with filters + pagination
router.get("/apps", async (req, res) => {
  try {
    const { category, platform, search, sort = "newest", page = "1", limit = "24" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(48, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(storeAppsTable.status, "approved")];
    if (category) conditions.push(eq(storeAppsTable.category, category));
    if (platform) conditions.push(eq(storeAppsTable.platform, platform));
    if (search) conditions.push(or(
      ilike(storeAppsTable.name, `%${search}%`),
      ilike(storeAppsTable.tagline, `%${search}%`),
    )!);

    const orderBy = sort === "rating" ? desc(storeAppsTable.rating)
      : sort === "downloads" ? desc(storeAppsTable.totalDownloads)
      : sort === "trending" ? desc(storeAppsTable.totalDownloads)
      : desc(storeAppsTable.createdAt);

    const [apps, totalResult] = await Promise.all([
      db.query.storeAppsTable.findMany({
        where: and(...conditions),
        orderBy,
        limit: limitNum,
        offset,
        with: { developer: true },
      }),
      db.select({ count: sql<number>`count(*)::int` })
        .from(storeAppsTable)
        .where(and(...conditions)),
    ]);

    const total = totalResult[0]?.count ?? 0;
    res.json({
      apps: apps.map(a => serializeAppSummary(a, (a as any).developer?.displayName ?? "Unknown")),
      total,
      page: pageNum,
      limit: limitNum,
    });
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
      limit: 12,
      with: { developer: true },
    });
    res.json(apps.map(a => serializeAppSummary(a, (a as any).developer?.displayName)));
  } catch (err) {
    logger.error({ err }, "listFeaturedStoreApps error");
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
    res.json(apps.map(a => serializeAppSummary(a, (a as any).developer?.displayName)));
  } catch (err) {
    logger.error({ err }, "listTrendingStoreApps error");
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

    const countMap = Object.fromEntries(counts.map(r => [r.category, r.count]));
    const result = CATEGORIES.map(c => ({
      name: c.name,
      iconEmoji: c.iconEmoji,
      count: countMap[c.name] ?? 0,
    }));
    res.json(result);
  } catch (err) {
    logger.error({ err }, "listStoreCategories error");
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
    if (!app) return void res.status(404).json({ error: "Not found" });
    res.json(serializeApp(app, (app as any).developer));
  } catch (err) {
    logger.error({ err }, "getStoreApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/apps/:slug/download
router.post("/apps/:slug/download", async (req, res) => {
  try {
    const app = await db.query.storeAppsTable.findFirst({
      where: and(eq(storeAppsTable.slug, req.params.slug), eq(storeAppsTable.status, "approved")),
    });
    if (!app) return void res.status(404).json({ error: "Not found" });
    await db.update(storeAppsTable)
      .set({ totalDownloads: app.totalDownloads + 1 })
      .where(eq(storeAppsTable.id, app.id));
    res.json({ downloadUrl: app.downloadUrl ?? "", webUrl: app.webUrl ?? null });
  } catch (err) {
    logger.error({ err }, "recordStoreAppDownload error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/apps/:slug/reviews
router.get("/apps/:slug/reviews", async (req, res) => {
  try {
    const app = await db.query.storeAppsTable.findFirst({
      where: eq(storeAppsTable.slug, req.params.slug),
    });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const reviews = await db.query.storeAppReviewsTable.findMany({
      where: and(eq(storeAppReviewsTable.appId, app.id), eq(storeAppReviewsTable.isFlagged, false)),
      orderBy: desc(storeAppReviewsTable.createdAt),
      limit: 50,
    });
    res.json(reviews.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "listStoreAppReviews error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/apps/:slug/reviews — requires auth
router.post("/apps/:slug/reviews", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return void res.status(400).json({ error: "Rating must be 1-5" });
    }
    const app = await db.query.storeAppsTable.findFirst({
      where: eq(storeAppsTable.slug, req.params.slug),
    });
    if (!app) return void res.status(404).json({ error: "Not found" });

    // Prevent duplicate reviews
    const existing = await db.query.storeAppReviewsTable.findFirst({
      where: and(eq(storeAppReviewsTable.appId, app.id), eq(storeAppReviewsTable.reviewerClerkId, userId!)),
    });
    if (existing) return void res.status(409).json({ error: "Already reviewed this app" });

    // Basic AI sentiment (simple heuristic if no quota)
    let sentimentLabel = "neutral";
    let sentimentScore = 0;
    if (rating >= 4) { sentimentLabel = "positive"; sentimentScore = 0.6; }
    else if (rating <= 2) { sentimentLabel = "negative"; sentimentScore = -0.6; }

    const [review] = await db.insert(storeAppReviewsTable).values({
      appId: app.id,
      reviewerClerkId: userId!,
      reviewerName: "User",
      rating,
      comment: comment ?? null,
      sentimentLabel,
      sentimentScore,
    }).returning();

    // Recalculate rating
    const allReviews = await db.select({ rating: storeAppReviewsTable.rating })
      .from(storeAppReviewsTable)
      .where(eq(storeAppReviewsTable.appId, app.id));
    const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    await db.update(storeAppsTable)
      .set({ rating: Math.round(avg * 10) / 10, ratingCount: allReviews.length })
      .where(eq(storeAppsTable.id, app.id));

    res.status(201).json({ ...review, createdAt: review.createdAt.toISOString() });
  } catch (err) {
    logger.error({ err }, "submitStoreAppReview error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/apps/:slug/versions
router.get("/apps/:slug/versions", async (req, res) => {
  try {
    const app = await db.query.storeAppsTable.findFirst({
      where: eq(storeAppsTable.slug, req.params.slug),
    });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const versions = await db.query.storeAppVersionsTable.findMany({
      where: eq(storeAppVersionsTable.appId, app.id),
      orderBy: desc(storeAppVersionsTable.createdAt),
    });
    res.json(versions.map(v => ({ ...v, createdAt: v.createdAt.toISOString() })));
  } catch (err) {
    logger.error({ err }, "listStoreAppVersions error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DEVELOPER PORTAL ──────────────────────────────────────────────────────────

// GET /store/developers/me
router.get("/developers/me", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.clerkUserId, userId!),
    });
    if (!dev) return void res.status(404).json({ error: "Not registered as a developer yet" });
    const totalApps = await db.select({ count: sql<number>`count(*)::int` })
      .from(storeAppsTable).where(eq(storeAppsTable.developerId, dev.id));
    const totalDownloads = await db.select({ sum: sql<number>`coalesce(sum(total_downloads),0)::int` })
      .from(storeAppsTable).where(eq(storeAppsTable.developerId, dev.id));
    res.json({
      ...dev,
      totalApps: totalApps[0]?.count ?? 0,
      totalDownloads: totalDownloads[0]?.sum ?? 0,
      createdAt: dev.createdAt.toISOString(),
      updatedAt: dev.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "getMyStoreDeveloper error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /store/developers/me
router.patch("/developers/me", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { displayName, bio, website, company, avatarUrl } = req.body;
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.clerkUserId, userId!),
    });
    if (!dev) return void res.status(404).json({ error: "Not found" });
    const [updated] = await db.update(storeDeveloperAccountsTable)
      .set({ displayName: displayName ?? dev.displayName, bio: bio ?? dev.bio, website: website ?? dev.website, company: company ?? dev.company, avatarUrl: avatarUrl ?? dev.avatarUrl, updatedAt: new Date() })
      .where(eq(storeDeveloperAccountsTable.id, dev.id))
      .returning();
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString(), totalApps: 0, totalDownloads: 0 });
  } catch (err) {
    logger.error({ err }, "updateMyStoreDeveloper error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/developers/me/dashboard
router.get("/developers/me/dashboard", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.clerkUserId, userId!),
    });
    if (!dev) return void res.status(404).json({ error: "Not found" });

    const apps = await db.query.storeAppsTable.findMany({
      where: eq(storeAppsTable.developerId, dev.id),
    });

    const totalDownloads = apps.reduce((s, a) => s + a.totalDownloads, 0);
    const reviewRows = await db.select({ count: sql<number>`count(*)::int`, avg: sql<number>`coalesce(avg(rating),0)` })
      .from(storeAppReviewsTable)
      .where(sql`app_id = ANY(${apps.map(a => a.id)})`);
    const totalReviews = reviewRows[0]?.count ?? 0;
    const averageRating = Math.round((reviewRows[0]?.avg ?? 0) * 10) / 10;

    res.json({
      totalApps: apps.length,
      totalDownloads,
      totalReviews,
      averageRating,
      downloadsThisWeek: 0,
      downloadsThisMonth: 0,
      appBreakdown: apps.map(a => ({
        appId: a.id,
        appName: a.name,
        downloads: a.totalDownloads,
        rating: a.rating,
        ratingCount: a.ratingCount,
        status: a.status,
      })),
    });
  } catch (err) {
    logger.error({ err }, "getStoreDeveloperDashboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /store/developers/me/apps
router.get("/developers/me/apps", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.clerkUserId, userId!),
    });
    if (!dev) return void res.status(404).json({ error: "Not found" });
    const apps = await db.query.storeAppsTable.findMany({
      where: eq(storeAppsTable.developerId, dev.id),
      orderBy: desc(storeAppsTable.createdAt),
    });
    res.json(apps.map(a => serializeApp(a, dev)));
  } catch (err) {
    logger.error({ err }, "listMyStoreApps error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/developers/me/apps — submit new app
router.post("/developers/me/apps", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;

    const { name, tagline, description, category, platform, iconUrl, screenshots, downloadUrl, webUrl, currentVersion } = req.body;
    if (!name || !tagline || !description || !category || !platform || !iconUrl) {
      return void res.status(400).json({ error: "Missing required fields" });
    }

    // Generate unique slug
    let slug = slugify(name);
    const existing = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.slug, slug) });
    if (existing) slug = `${slug}-${Date.now()}`;

    const [app] = await db.insert(storeAppsTable).values({
      developerId: dev.id,
      name, slug, tagline, description, category, platform, iconUrl,
      screenshots: screenshots ?? [],
      downloadUrl: downloadUrl ?? null,
      webUrl: webUrl ?? null,
      currentVersion: currentVersion ?? null,
      status: "pending_review",
    }).returning();

    res.status(201).json(serializeApp(app, dev));
  } catch (err) {
    logger.error({ err }, "submitStoreApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /store/developers/me/apps/:id
router.patch("/developers/me/apps/:id", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const appId = parseInt(req.params.id);
    const app = await db.query.storeAppsTable.findFirst({
      where: and(eq(storeAppsTable.id, appId), eq(storeAppsTable.developerId, dev.id)),
    });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const { tagline, description, category, platform, iconUrl, screenshots, downloadUrl, webUrl } = req.body;
    const [updated] = await db.update(storeAppsTable)
      .set({
        tagline: tagline ?? app.tagline,
        description: description ?? app.description,
        category: category ?? app.category,
        platform: platform ?? app.platform,
        iconUrl: iconUrl ?? app.iconUrl,
        screenshots: screenshots ?? app.screenshots,
        downloadUrl: downloadUrl ?? app.downloadUrl,
        webUrl: webUrl ?? app.webUrl,
        status: "pending_review", // re-submit for review on update
        updatedAt: new Date(),
      })
      .where(eq(storeAppsTable.id, appId))
      .returning();
    res.json(serializeApp(updated, dev));
  } catch (err) {
    logger.error({ err }, "updateMyStoreApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /store/developers/me/apps/:id
router.delete("/developers/me/apps/:id", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const appId = parseInt(req.params.id);
    const app = await db.query.storeAppsTable.findFirst({
      where: and(eq(storeAppsTable.id, appId), eq(storeAppsTable.developerId, dev.id)),
    });
    if (!app) return void res.status(404).json({ error: "Not found" });
    await db.update(storeAppsTable).set({ status: "removed", updatedAt: new Date() }).where(eq(storeAppsTable.id, appId));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "removeMyStoreApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/developers/me/apps/:id/versions
router.post("/developers/me/apps/:id/versions", requireAuth(), async (req, res) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;
    const appId = parseInt(req.params.id);
    const app = await db.query.storeAppsTable.findFirst({
      where: and(eq(storeAppsTable.id, appId), eq(storeAppsTable.developerId, dev.id)),
    });
    if (!app) return void res.status(404).json({ error: "Not found" });
    const { version, releaseNotes, fileUrl } = req.body;
    if (!version) return void res.status(400).json({ error: "Version is required" });
    const [v] = await db.insert(storeAppVersionsTable).values({
      appId, version, releaseNotes: releaseNotes ?? null, fileUrl: fileUrl ?? null,
    }).returning();
    await db.update(storeAppsTable).set({ currentVersion: version, updatedAt: new Date() }).where(eq(storeAppsTable.id, appId));
    res.status(201).json({ ...v, createdAt: v.createdAt.toISOString() });
  } catch (err) {
    logger.error({ err }, "addStoreAppVersion error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/payments/developer-signup
router.post("/payments/developer-signup", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { gateway, successUrl, cancelUrl } = req.body;
    if (!gateway) return void res.status(400).json({ error: "gateway required" });

    // Check not already registered
    const existing = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.clerkUserId, userId!),
    });
    if (existing?.registrationFeePaid) {
      return void res.status(409).json({ error: "Already registered and paid" });
    }

    const amount = 15; // USD
    const returnUrl = successUrl ?? `${process.env.REPLIT_DEV_DOMAIN}/app-store/developer`;

    if (gateway === "stripe") {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) return void res.status(503).json({ error: "Stripe not configured" });
      const stripe = new Stripe(stripeKey);
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{ price_data: { currency: "usd", product_data: { name: "Awajimaa App Store Developer Registration" }, unit_amount: amount * 100 }, quantity: 1 }],
        success_url: returnUrl + "?payment_success=1",
        cancel_url: cancelUrl ?? returnUrl,
        metadata: { clerkUserId: userId!, purpose: "store_developer_signup" },
      });
      return void res.json({ gateway: "stripe", paymentRef: session.id, checkoutUrl: session.url, clientSecret: null, paystackAuthorizationUrl: null, paypalOrderId: null });
    }

    if (gateway === "paystack") {
      const paystackKey = process.env.PAYSTACK_SECRET_KEY;
      if (!paystackKey) return void res.status(503).json({ error: "Paystack not configured" });
      const resp = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amount * 100 * 1550, // USD→NGN rough conversion (admin should configure)
          currency: "NGN",
          metadata: { clerkUserId: userId!, purpose: "store_developer_signup" },
          callback_url: returnUrl + "?payment_success=1",
        }),
      });
      const data = await resp.json() as any;
      return void res.json({ gateway: "paystack", paymentRef: data.data?.reference, checkoutUrl: null, clientSecret: null, paystackAuthorizationUrl: data.data?.authorization_url, paypalOrderId: null });
    }

    if (gateway === "paypal") {
      return void res.status(501).json({ error: "PayPal developer signup coming soon" });
    }

    res.status(400).json({ error: "Unknown gateway" });
  } catch (err) {
    logger.error({ err }, "initiateStoreDeveloperPayment error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /store/developers/register — complete registration after payment
router.post("/developers/register", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { displayName, bio, website, company, avatarUrl, paymentRef } = req.body;
    if (!displayName) return void res.status(400).json({ error: "displayName required" });

    const existing = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq(storeDeveloperAccountsTable.clerkUserId, userId!),
    });
    if (existing) return void res.status(409).json({ error: "Already registered" });

    const [dev] = await db.insert(storeDeveloperAccountsTable).values({
      clerkUserId: userId!,
      displayName,
      bio: bio ?? null,
      website: website ?? null,
      company: company ?? null,
      avatarUrl: avatarUrl ?? null,
      status: "active",
      registrationFeePaid: true,
      paymentRef: paymentRef ?? null,
    }).returning();

    res.status(201).json({
      ...dev,
      totalApps: 0,
      totalDownloads: 0,
      createdAt: dev.createdAt.toISOString(),
      updatedAt: dev.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "completeStoreDeveloperRegistration error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── ADMIN ROUTES ──────────────────────────────────────────────────────────────

router.get("/admin/stats", requireAuth(), async (req, res) => {
  try {
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const [apps, devs, reviews, pending, approved, rejected] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(storeAppsTable),
      db.select({ count: sql<number>`count(*)::int` }).from(storeDeveloperAccountsTable),
      db.select({ count: sql<number>`count(*)::int` }).from(storeAppReviewsTable),
      db.select({ count: sql<number>`count(*)::int` }).from(storeAppsTable).where(eq(storeAppsTable.status, "pending_review")),
      db.select({ count: sql<number>`count(*)::int` }).from(storeAppsTable).where(eq(storeAppsTable.status, "approved")),
      db.select({ count: sql<number>`count(*)::int` }).from(storeAppsTable).where(eq(storeAppsTable.status, "rejected")),
    ]);
    const downloads = await db.select({ sum: sql<number>`coalesce(sum(total_downloads),0)::int` }).from(storeAppsTable);
    const topApps = await db.query.storeAppsTable.findMany({
      where: eq(storeAppsTable.status, "approved"),
      orderBy: desc(storeAppsTable.totalDownloads),
      limit: 5,
      with: { developer: true },
    });
    res.json({
      totalApps: apps[0]?.count ?? 0,
      totalDevelopers: devs[0]?.count ?? 0,
      totalDownloads: downloads[0]?.sum ?? 0,
      totalReviews: reviews[0]?.count ?? 0,
      pendingReview: pending[0]?.count ?? 0,
      approvedApps: approved[0]?.count ?? 0,
      rejectedApps: rejected[0]?.count ?? 0,
      topApps: topApps.map(a => serializeAppSummary(a, (a as any).developer?.displayName)),
    });
  } catch (err) {
    logger.error({ err }, "getStoreAdminStats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/apps/pending", requireAuth(), async (req, res) => {
  try {
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const apps = await db.query.storeAppsTable.findMany({
      where: eq(storeAppsTable.status, "pending_review"),
      orderBy: asc(storeAppsTable.createdAt),
      with: { developer: true },
    });
    res.json(apps.map(a => serializeApp(a, (a as any).developer)));
  } catch (err) {
    logger.error({ err }, "listPendingStoreApps error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/apps", requireAuth(), async (req, res) => {
  try {
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const { status, search } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (status) conditions.push(eq(storeAppsTable.status, status));
    if (search) conditions.push(or(ilike(storeAppsTable.name, `%${search}%`), ilike(storeAppsTable.tagline, `%${search}%`))!);
    const apps = await db.query.storeAppsTable.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: desc(storeAppsTable.updatedAt),
      with: { developer: true },
    });
    res.json(apps.map(a => serializeApp(a, (a as any).developer)));
  } catch (err) {
    logger.error({ err }, "listAllStoreApps error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/apps/:id/ai-review", requireAuth(), async (req, res) => {
  try {
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const appId = parseInt(req.params.id);
    const app = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.id, appId) });
    if (!app) return void res.status(404).json({ error: "Not found" });

    // AI analysis via OpenAI
    let summary = "", category = app.category, policyFlags: string[] = [], score = 85, recommendation: "approve" | "review" | "reject" = "approve", malwareHints: string[] = [];
    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
      const prompt = `Analyze this app submission for an app store:
Name: ${app.name}
Category: ${app.category}
Platform: ${app.platform}
Tagline: ${app.tagline}
Description: ${app.description}

Respond as JSON with:
{
  "summary": "50-word compelling store summary",
  "category": "best category from: Productivity, Finance, Education, Health & Fitness, Entertainment, Social, Business, Utilities, Lifestyle, Shopping, Travel, Food & Drink, Other",
  "policyFlags": ["list any violations or empty array"],
  "score": 0-100,
  "recommendation": "approve|review|reject",
  "malwareHints": ["any suspicious patterns or empty array"]
}`;
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
      summary = parsed.summary ?? "";
      category = parsed.category ?? app.category;
      policyFlags = parsed.policyFlags ?? [];
      score = parsed.score ?? 85;
      recommendation = parsed.recommendation ?? "approve";
      malwareHints = parsed.malwareHints ?? [];
    } catch (aiErr) {
      logger.warn({ aiErr }, "AI review failed, using defaults");
      summary = `${app.name} — ${app.tagline}`;
    }

    await db.update(storeAppsTable).set({
      aiSummary: summary,
      aiCategory: category,
      aiPolicyFlags: JSON.stringify(policyFlags),
      aiReviewScore: score,
      aiReviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(storeAppsTable.id, appId));

    res.json({ appId, summary, category, policyFlags, score, recommendation, malwareHints });
  } catch (err) {
    logger.error({ err }, "triggerStoreAppAiReview error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/apps/:id/approve", requireAuth(), async (req, res) => {
  try {
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    const appId = parseInt(req.params.id);
    const [updated] = await db.update(storeAppsTable)
      .set({ status: "approved", reviewedByClerkId: userId!, reviewedAt: new Date(), rejectionReason: null, updatedAt: new Date() })
      .where(eq(storeAppsTable.id, appId))
      .returning();
    if (!updated) return void res.status(404).json({ error: "Not found" });
    res.json(serializeApp(updated, null));
  } catch (err) {
    logger.error({ err }, "approveStoreApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/apps/:id/reject", requireAuth(), async (req, res) => {
  try {
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const { userId } = getAuth(req);
    const { reason } = req.body;
    const appId = parseInt(req.params.id);
    const [updated] = await db.update(storeAppsTable)
      .set({ status: "rejected", reviewedByClerkId: userId!, reviewedAt: new Date(), rejectionReason: reason ?? null, updatedAt: new Date() })
      .where(eq(storeAppsTable.id, appId))
      .returning();
    if (!updated) return void res.status(404).json({ error: "Not found" });
    res.json(serializeApp(updated, null));
  } catch (err) {
    logger.error({ err }, "rejectStoreApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/apps/:id/feature", requireAuth(), async (req, res) => {
  try {
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const { featured } = req.body;
    const appId = parseInt(req.params.id);
    const [updated] = await db.update(storeAppsTable)
      .set({ isFeatured: !!featured, updatedAt: new Date() })
      .where(eq(storeAppsTable.id, appId))
      .returning();
    if (!updated) return void res.status(404).json({ error: "Not found" });
    res.json(serializeApp(updated, null));
  } catch (err) {
    logger.error({ err }, "featureStoreApp error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/developers", requireAuth(), async (req, res) => {
  try {
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const { status } = req.query as Record<string, string>;
    const devs = await db.query.storeDeveloperAccountsTable.findMany({
      where: status ? eq(storeDeveloperAccountsTable.status, status) : undefined,
      orderBy: desc(storeDeveloperAccountsTable.createdAt),
    });
    res.json(devs.map(d => ({ ...d, totalApps: 0, totalDownloads: 0, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() })));
  } catch (err) {
    logger.error({ err }, "listStoreDevelopers error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/developers/:id/suspend", requireAuth(), async (req, res) => {
  try {
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const { reason } = req.body;
    const devId = parseInt(req.params.id);
    const [updated] = await db.update(storeDeveloperAccountsTable)
      .set({ status: "suspended", suspensionReason: reason ?? null, updatedAt: new Date() })
      .where(eq(storeDeveloperAccountsTable.id, devId))
      .returning();
    if (!updated) return void res.status(404).json({ error: "Not found" });
    res.json({ ...updated, totalApps: 0, totalDownloads: 0, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (err) {
    logger.error({ err }, "suspendStoreDeveloper error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/reviews/:id/flag", requireAuth(), async (req, res) => {
  try {
    if (!isAdmin(req)) return void res.status(403).json({ error: "Admin only" });
    const { reason } = req.body;
    const reviewId = parseInt(req.params.id);
    const [updated] = await db.update(storeAppReviewsTable)
      .set({ isFlagged: true, flagReason: reason ?? null })
      .where(eq(storeAppReviewsTable.id, reviewId))
      .returning();
    if (!updated) return void res.status(404).json({ error: "Not found" });
    res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
  } catch (err) {
    logger.error({ err }, "flagStoreReview error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
