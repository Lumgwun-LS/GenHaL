/**
 * /api/ads — Ads Suite routes
 *
 * Covers five modules:
 *  1. Contacts   — CRUD + bulk CSV import
 *  2. Campaigns  — CRUD + platform publish
 *  3. Creatives  — CRUD (nested under campaign)
 *  4. Analytics  — read snapshots + sync from platform
 *  5. Email campaigns — CRUD + send via SMTP
 *
 * All routes are auth-gated via requireAuth (applied in routes/index.ts before
 * this router is mounted). Vendor ownership is always derived from the verified
 * Clerk session — never trusted from the request body.
 */

import express, { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, desc, inArray, gte, lte } from "drizzle-orm";
import {
  db,
  vendorsTable,
  adContactsTable,
  adCampaignsTable,
  adCreativesTable,
  adCampaignAnalyticsTable,
  adEmailCampaignsTable,
  vendorAdAccountsTable,
  socialAccountsTable,
  productsTable,
  vendorWebsitesTable,
} from "@workspace/db";
import { sendEmail } from "../lib/mailer";
import { decrypt } from "../lib/encryption";
import {
  publishAdCampaign,
  fetchAdAnalytics,
  toAdPlatform,
  toSocialPlatform,
  type MetaAdCreds,
} from "../lib/ads-platforms";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Auth helper ───────────────────────────────────────────────────────────────

async function resolveAuthedVendor(req: import("express").Request): Promise<{ vendorId: number | null; isAdmin: boolean }> {
  const { userId } = getAuth(req);
  if (!userId) return { vendorId: null, isAdmin: false };
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAdmin = adminIds.includes(userId);
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  return { vendorId: vendor?.id ?? null, isAdmin };
}

// ── CSV parser (no external deps) ────────────────────────────────────────────

interface CsvContact {
  name: string;
  email?: string;
  phone?: string;
  /** CSV path: semicolon/pipe-separated string. JSON path: already-parsed string[]. */
  tags?: string | string[];
  platform?: string;
}

/**
 * Parses a simple CSV string into contact rows.
 * Accepts comma-separated values, optional header row.
 * Expected columns (order-independent, case-insensitive): name, email, phone, tags, platform
 */
function parseCsvContacts(csv: string): CsvContact[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Detect and parse header row
  const rawHeader = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
  const knownCols = ["name", "email", "phone", "tags", "platform"];
  const isHeader = rawHeader.some((h) => knownCols.includes(h));

  let headerRow: string[];
  let dataLines: string[];

  if (isHeader) {
    headerRow = rawHeader;
    dataLines = lines.slice(1);
  } else {
    // Assume positional: name, email, phone, tags, platform
    headerRow = ["name", "email", "phone", "tags", "platform"];
    dataLines = lines;
  }

  const contacts: CsvContact[] = [];
  for (const line of dataLines) {
    // Simple split — doesn't handle quoted commas but good enough for a contacts list
    const cells = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const row: Record<string, string> = {};
    headerRow.forEach((col, i) => { if (cells[i]) row[col] = cells[i]; });

    if (!row["name"]) continue;
    contacts.push({
      name: row["name"],
      email: row["email"] || undefined,
      phone: row["phone"] || undefined,
      tags: row["tags"] || undefined,
      platform: row["platform"] || undefined,
    });
  }
  return contacts;
}

// ── Contacts ──────────────────────────────────────────────────────────────────

/** GET /ads/contacts */
router.get("/ads/contacts", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  // Admin without a vendor record has no contacts to list — return empty
  if (!authed.vendorId) { res.json([]); return; }

  const rows = await db
    .select()
    .from(adContactsTable)
    .where(eq(adContactsTable.vendorId, authed.vendorId))
    .orderBy(desc(adContactsTable.createdAt));

  res.json(rows.map(serializeContact));
});

/** POST /ads/contacts */
router.post("/ads/contacts", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!authed.vendorId) { res.status(403).json({ error: "A vendor account is required to create contacts" }); return; }

  const { name, email, phone, tags, source, platform } = req.body;
  if (!name || typeof name !== "string") { res.status(400).json({ error: "name is required" }); return; }

  const [row] = await db.insert(adContactsTable).values({
    vendorId: authed.vendorId,
    name: name.trim(),
    email: email ?? null,
    phone: phone ?? null,
    tags: Array.isArray(tags) ? tags : [],
    source: source ?? "manual",
    platform: platform ?? null,
  }).returning();

  res.status(201).json(serializeContact(row));
});

/**
 * POST /ads/contacts/import
 * Accepts CSV as text/plain or text/csv body, or JSON array body.
 * Uses express.text() middleware to ensure the raw CSV string is parsed before
 * the handler runs; JSON arrays are handled by the upstream JSON parser.
 * Returns { imported, skipped } counts.
 */
router.post(
  "/ads/contacts/import",
  express.text({ type: ["text/plain", "text/csv", "text/*"] }),
  async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!authed.vendorId) { res.status(403).json({ error: "Admins must have a vendor account to import contacts" }); return; }

  let contacts: CsvContact[] = [];

  const contentType = (req.headers["content-type"] ?? "").toLowerCase();
  if (typeof req.body === "string") {
    // express.text() parsed a text/* body — feed directly to CSV parser
    contacts = parseCsvContacts(req.body);
  } else if (Array.isArray(req.body)) {
    // JSON array of contact objects
    contacts = req.body.filter((c: any) => c?.name).map((c: any) => ({
      name: String(c.name),
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
      // Preserve string[] from JSON clients; also accept semicolon-separated string
      tags: Array.isArray(c.tags) ? c.tags : (typeof c.tags === "string" ? c.tags : undefined),
      platform: c.platform ?? undefined,
    }));
  } else {
    res.status(400).json({ error: "Send CSV as text/plain body or a JSON array of { name, email, phone, tags, platform }" });
    return;
  }

  if (contacts.length === 0) { res.json({ imported: 0, skipped: 0 }); return; }

  const rows = contacts.map((c) => ({
    vendorId: authed.vendorId!,
    name: c.name.trim(),
    email: c.email ?? null,
    phone: c.phone ?? null,
    tags: Array.isArray(c.tags)
      ? (c.tags as string[]).map((t) => String(t).trim()).filter(Boolean)
      : (c.tags ? (c.tags as string).split(/[;|]/).map((t) => t.trim()).filter(Boolean) : []),
    source: "csv" as const,
    platform: c.platform ?? null,
  }));

  await db.insert(adContactsTable).values(rows);
  res.json({ imported: rows.length, skipped: 0 });
},
);

/** PATCH /ads/contacts/:id */
router.patch("/ads/contacts/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(adContactsTable).where(eq(adContactsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Contact not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { name, email, phone, tags, platform } = req.body;
  const [updated] = await db.update(adContactsTable)
    .set({
      ...(name ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(Array.isArray(tags) ? { tags } : {}),
      ...(platform !== undefined ? { platform } : {}),
    })
    .where(eq(adContactsTable.id, id))
    .returning();

  res.json(serializeContact(updated));
});

/** DELETE /ads/contacts/:id */
router.delete("/ads/contacts/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select({ vendorId: adContactsTable.vendorId }).from(adContactsTable).where(eq(adContactsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Contact not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(adContactsTable).where(eq(adContactsTable.id, id));
  res.sendStatus(204);
});

// ── Campaigns ─────────────────────────────────────────────────────────────────

/** GET /ads/campaigns */
router.get("/ads/campaigns", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  // Admin without a vendor record has no campaigns to list — return empty
  if (!authed.vendorId) { res.json([]); return; }

  const rows = await db
    .select()
    .from(adCampaignsTable)
    .where(eq(adCampaignsTable.vendorId, authed.vendorId))
    .orderBy(desc(adCampaignsTable.createdAt));

  res.json(rows.map(serializeCampaign));
});

/** GET /ads/products — vendor's active products + shop slug for ad destination picker */
router.get("/ads/products", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [products, websites] = await Promise.all([
    db.select({
      id: productsTable.id,
      name: productsTable.name,
      price: productsTable.price,
      imageUrl: productsTable.imageUrl,
      category: productsTable.category,
    })
      .from(productsTable)
      .where(and(eq(productsTable.vendorId, authed.vendorId), eq(productsTable.status, "active")))
      .orderBy(productsTable.name),
    db.select({ slug: vendorWebsitesTable.slug })
      .from(vendorWebsitesTable)
      .where(eq(vendorWebsitesTable.vendorId, authed.vendorId))
      .limit(1),
  ]);

  res.json({ products, shopSlug: websites[0]?.slug ?? null });
});

/** POST /ads/campaigns */
router.post("/ads/campaigns", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!authed.vendorId) { res.status(403).json({ error: "A vendor account is required to create campaigns" }); return; }

  const { name, platform, objective, budgetAmount, budgetCurrency, startDate, endDate, audienceJson,
    productId, destinationUrl, utmSource, utmMedium, utmCampaign } = req.body;
  if (!name || !platform) { res.status(400).json({ error: "name and platform are required" }); return; }

  const [campaign] = await db.insert(adCampaignsTable).values({
    vendorId: authed.vendorId,
    name,
    platform,
    objective: objective ?? "awareness",
    budgetAmount: budgetAmount ? String(budgetAmount) : null,
    budgetCurrency: budgetCurrency ?? "USD",
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    audienceJson: audienceJson ?? null,
    productId: productId ?? null,
    destinationUrl: destinationUrl ?? null,
    utmSource: utmSource ?? null,
    utmMedium: utmMedium ?? "paid",
    utmCampaign: utmCampaign ?? null,
  }).returning();

  // If a creative was included in the payload, save it
  const { headline, body, cta, imageUrl } = req.body;
  let creative = null;
  if (headline || body || cta || imageUrl) {
    const [c] = await db.insert(adCreativesTable).values({
      campaignId: campaign.id,
      headline: headline ?? null,
      body: body ?? null,
      cta: cta ?? null,
      imageUrl: imageUrl ?? null,
    }).returning();
    creative = serializeCreative(c);
  }

  res.status(201).json({ ...serializeCampaign(campaign), creative });
});

/** GET /ads/campaigns/:id */
router.get("/ads/campaigns/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const [campaign] = await db.select().from(adCampaignsTable).where(eq(adCampaignsTable.id, id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!authed.isAdmin && campaign.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const creatives = await db.select().from(adCreativesTable).where(eq(adCreativesTable.campaignId, id));

  res.json({ ...serializeCampaign(campaign), creatives: creatives.map(serializeCreative) });
});

/** PATCH /ads/campaigns/:id */
router.patch("/ads/campaigns/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(adCampaignsTable).where(eq(adCampaignsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { name, platform, objective, status, budgetAmount, budgetCurrency, startDate, endDate, audienceJson,
    productId, destinationUrl, utmSource, utmMedium, utmCampaign } = req.body;
  const [updated] = await db.update(adCampaignsTable)
    .set({
      ...(name ? { name } : {}),
      ...(platform ? { platform } : {}),
      ...(objective ? { objective } : {}),
      ...(status ? { status } : {}),
      ...(budgetAmount !== undefined ? { budgetAmount: budgetAmount ? String(budgetAmount) : null } : {}),
      ...(budgetCurrency ? { budgetCurrency } : {}),
      ...(startDate !== undefined ? { startDate } : {}),
      ...(endDate !== undefined ? { endDate } : {}),
      ...(audienceJson !== undefined ? { audienceJson } : {}),
      ...(productId !== undefined ? { productId: productId ?? null } : {}),
      ...(destinationUrl !== undefined ? { destinationUrl: destinationUrl ?? null } : {}),
      ...(utmSource !== undefined ? { utmSource: utmSource ?? null } : {}),
      ...(utmMedium !== undefined ? { utmMedium: utmMedium ?? "paid" } : {}),
      ...(utmCampaign !== undefined ? { utmCampaign: utmCampaign ?? null } : {}),
    })
    .where(eq(adCampaignsTable.id, id))
    .returning();

  res.json(serializeCampaign(updated));
});

/** DELETE /ads/campaigns/:id */
router.delete("/ads/campaigns/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select({ vendorId: adCampaignsTable.vendorId }).from(adCampaignsTable).where(eq(adCampaignsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(adCampaignsTable).where(eq(adCampaignsTable.id, id));
  res.sendStatus(204);
});

/**
 * POST /ads/campaigns/:id/publish
 * Attempts to publish the campaign to its target platform.
 * Returns { status: "not_connected", error } gracefully when credentials
 * are not yet configured.
 */
router.post("/ads/campaigns/:id/publish", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const [campaign] = await db.select().from(adCampaignsTable).where(eq(adCampaignsTable.id, id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!authed.isAdmin && campaign.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [creative] = await db.select().from(adCreativesTable).where(eq(adCreativesTable.campaignId, id));

  // ── Resolve per-vendor ad credentials ────────────────────────────────────
  const adPlatform = toAdPlatform(campaign.platform);
  let metaCreds: MetaAdCreds | undefined;
  let twitterAccountId: string | undefined;

  if (authed.vendorId) {
    const [adAccount] = await db
      .select()
      .from(vendorAdAccountsTable)
      .where(
        and(
          eq(vendorAdAccountsTable.vendorId, authed.vendorId),
          eq(vendorAdAccountsTable.platform, adPlatform),
        ),
      );

    if (adAccount) {
      if (adPlatform === "meta") {
        // Prefer the long-lived user token (refreshTokenEncrypted for Meta)
        // as it carries the ads_management scope.
        const socialPlatform = toSocialPlatform(campaign.platform);
        const [social] = await db
          .select({
            accessTokenEncrypted: socialAccountsTable.accessTokenEncrypted,
            refreshTokenEncrypted: socialAccountsTable.refreshTokenEncrypted,
          })
          .from(socialAccountsTable)
          .where(
            and(
              eq(socialAccountsTable.vendorId, authed.vendorId),
              eq(socialAccountsTable.platform, socialPlatform),
              eq(socialAccountsTable.status, "active"),
            ),
          );

        const tokenEnc = social?.refreshTokenEncrypted ?? social?.accessTokenEncrypted;
        if (tokenEnc) {
          metaCreds = {
            accessToken: decrypt(tokenEnc),
            adAccountId: adAccount.externalAccountId,
          };
        }
      } else if (adPlatform === "twitter") {
        twitterAccountId = adAccount.externalAccountId;
      }
    }
  }

  const campaignInput = {
    name: campaign.name,
    objective: campaign.objective,
    budgetAmount: campaign.budgetAmount,
    budgetCurrency: campaign.budgetCurrency,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    audienceJson: campaign.audienceJson,
    creative: creative ? {
      headline: creative.headline,
      body: creative.body,
      cta: creative.cta,
      imageUrl: creative.imageUrl,
    } : undefined,
  };

  const result = await publishAdCampaign(campaign.platform, campaignInput, metaCreds, twitterAccountId);

  if (!result.connected) {
    // Update campaign status to reflect the error, but don't fail the request
    await db.update(adCampaignsTable)
      .set({ lastPublishError: result.error ?? "Platform not connected" })
      .where(eq(adCampaignsTable.id, id));

    res.json({
      status: "not_connected",
      error: result.error,
      message: "Configure platform credentials to publish this campaign.",
    });
    return;
  }

  // Store platform IDs and mark as active
  const [updated] = await db.update(adCampaignsTable)
    .set({
      status: "active",
      platformCampaignId: result.platformCampaignId ?? null,
      platformAdsetId: result.platformAdsetId ?? null,
      platformAdId: result.platformAdId ?? null,
      lastPublishError: null,
    })
    .where(eq(adCampaignsTable.id, id))
    .returning();

  res.json({ status: "published", campaign: serializeCampaign(updated) });
});

// ── Creatives ─────────────────────────────────────────────────────────────────

/** GET /ads/campaigns/:id/creatives */
router.get("/ads/campaigns/:id/creatives", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const campaignId = parseInt(req.params.id, 10);
  const [campaign] = await db.select({ vendorId: adCampaignsTable.vendorId }).from(adCampaignsTable).where(eq(adCampaignsTable.id, campaignId));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!authed.isAdmin && campaign.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const rows = await db.select().from(adCreativesTable).where(eq(adCreativesTable.campaignId, campaignId));
  res.json(rows.map(serializeCreative));
});

/** POST /ads/campaigns/:id/creatives */
router.post("/ads/campaigns/:id/creatives", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const campaignId = parseInt(req.params.id, 10);
  const [campaign] = await db.select({ vendorId: adCampaignsTable.vendorId }).from(adCampaignsTable).where(eq(adCampaignsTable.id, campaignId));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!authed.isAdmin && campaign.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { headline, body, cta, imageUrl } = req.body;
  const [creative] = await db.insert(adCreativesTable).values({
    campaignId,
    headline: headline ?? null,
    body: body ?? null,
    cta: cta ?? null,
    imageUrl: imageUrl ?? null,
  }).returning();

  res.status(201).json(serializeCreative(creative));
});

/** PATCH /ads/campaigns/:campaignId/creatives/:id */
router.patch("/ads/campaigns/:campaignId/creatives/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const campaignId = parseInt(req.params.campaignId, 10);
  const [campaign] = await db.select({ vendorId: adCampaignsTable.vendorId }).from(adCampaignsTable).where(eq(adCampaignsTable.id, campaignId));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!authed.isAdmin && campaign.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { headline, body, cta, imageUrl } = req.body;
  const [updated] = await db.update(adCreativesTable)
    .set({
      ...(headline !== undefined ? { headline } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(cta !== undefined ? { cta } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
    })
    .where(and(eq(adCreativesTable.id, id), eq(adCreativesTable.campaignId, campaignId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Creative not found" }); return; }
  res.json(serializeCreative(updated));
});

// ── Analytics ─────────────────────────────────────────────────────────────────

/** GET /ads/campaigns/:id/analytics */
router.get("/ads/campaigns/:id/analytics", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const [campaign] = await db.select({ vendorId: adCampaignsTable.vendorId }).from(adCampaignsTable).where(eq(adCampaignsTable.id, id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!authed.isAdmin && campaign.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { since, until } = req.query;
  let query = db.select().from(adCampaignAnalyticsTable).where(eq(adCampaignAnalyticsTable.campaignId, id));

  const rows = await db
    .select()
    .from(adCampaignAnalyticsTable)
    .where(
      and(
        eq(adCampaignAnalyticsTable.campaignId, id),
        since ? gte(adCampaignAnalyticsTable.date, String(since)) : undefined,
        until ? lte(adCampaignAnalyticsTable.date, String(until)) : undefined,
      )
    )
    .orderBy(adCampaignAnalyticsTable.date);

  res.json(rows.map(serializeAnalytics));
});

/**
 * GET /ads/campaigns/:id/analytics/sync
 * Pulls fresh metrics from the platform API and upserts them.
 * Returns the updated snapshot rows.
 */
router.get("/ads/campaigns/:id/analytics/sync", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const [campaign] = await db.select().from(adCampaignsTable).where(eq(adCampaignsTable.id, id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!authed.isAdmin && campaign.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  if (!campaign.platformCampaignId) {
    // Campaign hasn't been published yet — return what we have
    const cached = await db.select().from(adCampaignAnalyticsTable).where(eq(adCampaignAnalyticsTable.campaignId, id)).orderBy(adCampaignAnalyticsTable.date);
    res.json({ synced: false, reason: "Campaign not yet published to platform", data: cached.map(serializeAnalytics) });
    return;
  }

  const now = new Date();
  const until = now.toISOString().slice(0, 10);
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Resolve ad credentials for analytics fetch
  const syncAdPlatform = toAdPlatform(campaign.platform);
  let syncMetaCreds: Pick<MetaAdCreds, "accessToken"> | undefined;
  let syncTwitterAccountId: string | undefined;

  if (authed.vendorId) {
    const [adAcct] = await db
      .select()
      .from(vendorAdAccountsTable)
      .where(
        and(
          eq(vendorAdAccountsTable.vendorId, authed.vendorId),
          eq(vendorAdAccountsTable.platform, syncAdPlatform),
        ),
      );

    if (adAcct) {
      if (syncAdPlatform === "meta") {
        const [social] = await db
          .select({ refreshTokenEncrypted: socialAccountsTable.refreshTokenEncrypted, accessTokenEncrypted: socialAccountsTable.accessTokenEncrypted })
          .from(socialAccountsTable)
          .where(
            and(
              eq(socialAccountsTable.vendorId, authed.vendorId),
              eq(socialAccountsTable.platform, toSocialPlatform(campaign.platform)),
              eq(socialAccountsTable.status, "active"),
            ),
          );
        const enc = social?.refreshTokenEncrypted ?? social?.accessTokenEncrypted;
        if (enc) syncMetaCreds = { accessToken: decrypt(enc) };
      } else if (syncAdPlatform === "twitter") {
        syncTwitterAccountId = adAcct.externalAccountId;
      }
    }
  }

  const result = await fetchAdAnalytics(campaign.platform, campaign.platformCampaignId, since, until, syncMetaCreds, syncTwitterAccountId);
  if (!result.connected) {
    const cached = await db.select().from(adCampaignAnalyticsTable).where(eq(adCampaignAnalyticsTable.campaignId, id)).orderBy(adCampaignAnalyticsTable.date);
    res.json({ synced: false, reason: result.error, data: cached.map(serializeAnalytics) });
    return;
  }

  // Upsert each daily row
  const upserted: typeof adCampaignAnalyticsTable.$inferSelect[] = [];
  for (const day of result.data ?? []) {
    const [existing] = await db
      .select()
      .from(adCampaignAnalyticsTable)
      .where(and(eq(adCampaignAnalyticsTable.campaignId, id), eq(adCampaignAnalyticsTable.date, day.date)));

    if (existing) {
      const [updated] = await db.update(adCampaignAnalyticsTable)
        .set({
          impressions: day.impressions,
          clicks: day.clicks,
          spend: String(day.spend),
          reach: day.reach,
          conversions: day.conversions,
        })
        .where(eq(adCampaignAnalyticsTable.id, existing.id))
        .returning();
      upserted.push(updated);
    } else {
      const [inserted] = await db.insert(adCampaignAnalyticsTable).values({
        campaignId: id,
        date: day.date,
        impressions: day.impressions,
        clicks: day.clicks,
        spend: String(day.spend),
        reach: day.reach,
        conversions: day.conversions,
      }).returning();
      upserted.push(inserted);
    }
  }

  res.json({ synced: true, data: upserted.map(serializeAnalytics) });
});

// ── Email Campaigns ───────────────────────────────────────────────────────────

/** GET /ads/email-campaigns */
router.get("/ads/email-campaigns", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  // Admin without a vendor record has no email campaigns — return empty
  if (!authed.vendorId) { res.json([]); return; }

  const rows = await db
    .select()
    .from(adEmailCampaignsTable)
    .where(eq(adEmailCampaignsTable.vendorId, authed.vendorId))
    .orderBy(desc(adEmailCampaignsTable.createdAt));

  res.json(rows.map(serializeEmailCampaign));
});

/** POST /ads/email-campaigns */
router.post("/ads/email-campaigns", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!authed.vendorId) { res.status(403).json({ error: "A vendor account is required to create email campaigns" }); return; }

  const { subject, bodyHtml, fromName, contactFilterJson } = req.body;
  if (!subject || !bodyHtml || !fromName) { res.status(400).json({ error: "subject, bodyHtml, and fromName are required" }); return; }

  const [row] = await db.insert(adEmailCampaignsTable).values({
    vendorId: authed.vendorId,
    subject,
    bodyHtml,
    fromName,
    contactFilterJson: contactFilterJson ?? null,
  }).returning();

  res.status(201).json(serializeEmailCampaign(row));
});

/** GET /ads/email-campaigns/:id */
router.get("/ads/email-campaigns/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const [row] = await db.select().from(adEmailCampaignsTable).where(eq(adEmailCampaignsTable.id, id));
  if (!row) { res.status(404).json({ error: "Email campaign not found" }); return; }
  if (!authed.isAdmin && row.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  res.json(serializeEmailCampaign(row));
});

/** PATCH /ads/email-campaigns/:id */
router.patch("/ads/email-campaigns/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select({ vendorId: adEmailCampaignsTable.vendorId, status: adEmailCampaignsTable.status }).from(adEmailCampaignsTable).where(eq(adEmailCampaignsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Email campaign not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (existing.status === "sent") { res.status(409).json({ error: "Cannot edit a campaign that has already been sent." }); return; }

  const { subject, bodyHtml, fromName, contactFilterJson } = req.body;
  const [updated] = await db.update(adEmailCampaignsTable)
    .set({
      ...(subject ? { subject } : {}),
      ...(bodyHtml ? { bodyHtml } : {}),
      ...(fromName ? { fromName } : {}),
      ...(contactFilterJson !== undefined ? { contactFilterJson } : {}),
    })
    .where(eq(adEmailCampaignsTable.id, id))
    .returning();

  res.json(serializeEmailCampaign(updated));
});

/** DELETE /ads/email-campaigns/:id */
router.delete("/ads/email-campaigns/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select({ vendorId: adEmailCampaignsTable.vendorId }).from(adEmailCampaignsTable).where(eq(adEmailCampaignsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Email campaign not found" }); return; }
  if (!authed.isAdmin && existing.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(adEmailCampaignsTable).where(eq(adEmailCampaignsTable.id, id));
  res.sendStatus(204);
});

/**
 * POST /ads/email-campaigns/:id/send
 * Dispatches the campaign to the matching contacts via SMTP.
 * Filters contacts by tags/platform if contactFilterJson is set.
 */
router.post("/ads/email-campaigns/:id/send", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const [campaign] = await db.select().from(adEmailCampaignsTable).where(eq(adEmailCampaignsTable.id, id));
  if (!campaign) { res.status(404).json({ error: "Email campaign not found" }); return; }
  if (!authed.isAdmin && campaign.vendorId !== authed.vendorId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (campaign.status === "sent") { res.status(409).json({ error: "This campaign has already been sent." }); return; }
  if (campaign.status === "sending") { res.status(409).json({ error: "This campaign is currently being sent." }); return; }

  // Mark as sending to prevent duplicate sends
  await db.update(adEmailCampaignsTable).set({ status: "sending" }).where(eq(adEmailCampaignsTable.id, id));

  // Build contact query with optional filter
  let allContacts = await db
    .select()
    .from(adContactsTable)
    .where(eq(adContactsTable.vendorId, campaign.vendorId));

  const filter = campaign.contactFilterJson as { tags?: string[]; platform?: string } | null;
  if (filter?.tags?.length) {
    allContacts = allContacts.filter((c) => filter.tags!.some((t) => c.tags.includes(t)));
  }
  if (filter?.platform) {
    allContacts = allContacts.filter((c) => c.platform === filter.platform);
  }

  const recipients = allContacts.filter((c) => c.email);
  if (recipients.length === 0) {
    await db.update(adEmailCampaignsTable).set({ status: "draft" }).where(eq(adEmailCampaignsTable.id, id));
    res.status(400).json({ error: "No contacts with email addresses match this campaign's filter." });
    return;
  }

  // Send emails — fire-and-don't-block-the-response for large lists
  let sent = 0;
  let failed = 0;
  for (const contact of recipients) {
    const result = await sendEmail({
      to: contact.email!,
      subject: campaign.subject,
      html: campaign.bodyHtml,
    });
    if (result.status === "sent") sent++;
    else failed++;
  }

  // Status reflects actual delivery outcome:
  //   "sent"   — at least one email was delivered
  //   "failed" — all sends failed (SMTP not configured, connection error, etc.)
  // "failed" campaigns can be retried. "sent" campaigns cannot.
  const finalStatus = sent > 0 ? "sent" : "failed";
  const [updated] = await db.update(adEmailCampaignsTable)
    .set({
      status: finalStatus,
      sentCount: sent,
      // Only record sentAt when at least one email was actually sent
      ...(sent > 0 ? { sentAt: new Date() } : {}),
    })
    .where(eq(adEmailCampaignsTable.id, id))
    .returning();

  logger.info({ campaignId: id, sent, failed, finalStatus }, "[ads] Email campaign send complete");
  res.json({ status: finalStatus, sent, failed, campaign: serializeEmailCampaign(updated) });
});

// ── Serializers ───────────────────────────────────────────────────────────────

function serializeContact(c: typeof adContactsTable.$inferSelect) {
  return {
    id: c.id,
    vendorId: c.vendorId,
    name: c.name,
    email: c.email,
    phone: c.phone,
    tags: c.tags,
    source: c.source,
    platform: c.platform,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function serializeCampaign(c: typeof adCampaignsTable.$inferSelect) {
  return {
    id: c.id,
    vendorId: c.vendorId,
    name: c.name,
    platform: c.platform,
    objective: c.objective,
    status: c.status,
    budgetAmount: c.budgetAmount,
    budgetCurrency: c.budgetCurrency,
    startDate: c.startDate,
    endDate: c.endDate,
    audienceJson: c.audienceJson,
    platformCampaignId: c.platformCampaignId,
    platformAdsetId: c.platformAdsetId,
    platformAdId: c.platformAdId,
    lastPublishError: c.lastPublishError,
    productId: c.productId,
    destinationUrl: c.destinationUrl,
    utmSource: c.utmSource,
    utmMedium: c.utmMedium,
    utmCampaign: c.utmCampaign,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function serializeCreative(c: typeof adCreativesTable.$inferSelect) {
  return {
    id: c.id,
    campaignId: c.campaignId,
    headline: c.headline,
    body: c.body,
    cta: c.cta,
    imageUrl: c.imageUrl,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function serializeAnalytics(a: typeof adCampaignAnalyticsTable.$inferSelect) {
  return {
    id: a.id,
    campaignId: a.campaignId,
    date: a.date,
    impressions: a.impressions,
    clicks: a.clicks,
    spend: a.spend,
    reach: a.reach,
    conversions: a.conversions,
    ctr: a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(2) : "0.00",
    updatedAt: a.updatedAt.toISOString(),
  };
}

function serializeEmailCampaign(c: typeof adEmailCampaignsTable.$inferSelect) {
  return {
    id: c.id,
    vendorId: c.vendorId,
    subject: c.subject,
    bodyHtml: c.bodyHtml,
    fromName: c.fromName,
    status: c.status,
    contactFilterJson: c.contactFilterJson,
    sentCount: c.sentCount,
    sentAt: c.sentAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// ── Vendor Ad Accounts ────────────────────────────────────────────────────────

function serializeAdAccount(a: typeof vendorAdAccountsTable.$inferSelect) {
  return {
    id: a.id,
    vendorId: a.vendorId,
    platform: a.platform,
    externalAccountId: a.externalAccountId,
    accountName: a.accountName ?? null,
    status: a.status,
    lastError: a.lastError ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

/** GET /ads/ad-accounts — list vendor's connected ad platform accounts */
router.get("/ads/ad-accounts", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!authed.vendorId) { res.json([]); return; }

  const rows = await db
    .select()
    .from(vendorAdAccountsTable)
    .where(eq(vendorAdAccountsTable.vendorId, authed.vendorId))
    .orderBy(vendorAdAccountsTable.platform);

  res.json(rows.map(serializeAdAccount));
});

/** POST /ads/ad-accounts — connect an ad account */
router.post("/ads/ad-accounts", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!authed.vendorId) { res.status(403).json({ error: "Vendor account required" }); return; }

  const { platform, externalAccountId, accountName } = req.body as {
    platform?: string;
    externalAccountId?: string;
    accountName?: string;
  };
  if (!platform || !externalAccountId) {
    res.status(400).json({ error: "platform and externalAccountId are required" });
    return;
  }

  // Upsert — one ad account per platform per vendor
  const [existing] = await db
    .select({ id: vendorAdAccountsTable.id })
    .from(vendorAdAccountsTable)
    .where(and(
      eq(vendorAdAccountsTable.vendorId, authed.vendorId),
      eq(vendorAdAccountsTable.platform, platform),
    ));

  if (existing) {
    const [updated] = await db
      .update(vendorAdAccountsTable)
      .set({ externalAccountId, accountName: accountName ?? null, status: "active", lastError: null })
      .where(eq(vendorAdAccountsTable.id, existing.id))
      .returning();
    res.json(serializeAdAccount(updated));
    return;
  }

  const [created] = await db
    .insert(vendorAdAccountsTable)
    .values({
      vendorId: authed.vendorId,
      platform,
      externalAccountId,
      accountName: accountName ?? null,
    })
    .returning();
  res.status(201).json(serializeAdAccount(created));
});

/** DELETE /ads/ad-accounts/:id — disconnect an ad account */
router.delete("/ads/ad-accounts/:id", async (req, res): Promise<void> => {
  const authed = await resolveAuthedVendor(req);
  if (!authed.vendorId && !authed.isAdmin) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  const [adAccount] = await db
    .select()
    .from(vendorAdAccountsTable)
    .where(eq(vendorAdAccountsTable.id, id));

  if (!adAccount) { res.status(404).json({ error: "Ad account not found" }); return; }
  if (!authed.isAdmin && adAccount.vendorId !== authed.vendorId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  await db.delete(vendorAdAccountsTable).where(eq(vendorAdAccountsTable.id, id));
  res.json({ ok: true });
});

export default router;
