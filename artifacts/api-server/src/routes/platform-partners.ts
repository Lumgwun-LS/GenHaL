/**
 * Platform Partners — admin management, AI doc generation, vendor marketplace,
 * public docs portal, and Git push webhook for auto-sync.
 *
 * Public (no auth):
 *   GET  /docs/:slug                     — rendered doc portal for a platform
 *   POST /platform-partners/webhook/github  — GitHub push webhook (HMAC verified)
 *   POST /platform-partners/webhook/gitlab  — GitLab push webhook (HMAC verified)
 *
 * Admin only:
 *   GET    /admin/platform-partners         — list all partners
 *   POST   /admin/platform-partners         — register a new partner
 *   GET    /admin/platform-partners/:id     — get partner detail
 *   PUT    /admin/platform-partners/:id     — update partner
 *   DELETE /admin/platform-partners/:id     — delete partner
 *   POST   /admin/platform-partners/:id/generate-docs — trigger AI doc gen
 *   POST   /admin/platform-partners/:id/enable        — enable/disable
 *
 * Vendor (auth required):
 *   GET    /marketplace                     — list enabled partners + connection status
 *   POST   /marketplace/:partnerId/connect  — store connection credential
 *   DELETE /marketplace/:partnerId/connect  — disconnect
 *
 * Platform Partner analytics (admin or self):
 *   GET    /platform-partners/:id/analytics — connection stats
 */

import crypto from "crypto";
import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  db,
  platformPartnersTable,
  vendorPlatformConnectionsTable,
  vendorsTable,
} from "@workspace/db";
import {
  fetchSpecFromUrl,
  fetchSpecFromGit,
  generateDocPortal,
  generateChangelog,
} from "../lib/doc-generator";
import { encrypt, decrypt } from "../lib/encryption";

function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

/** Resolve vendorId from clerkUserId, or null. */
async function resolveVendorId(userId: string): Promise<number | null> {
  const [v] = await db
    .select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, userId))
    .limit(1);
  return v?.id ?? null;
}

/** Fetch the raw spec string for a partner (all three source types). */
async function fetchRawSpec(partner: typeof platformPartnersTable.$inferSelect): Promise<string> {
  switch (partner.specSourceType) {
    case "url": {
      if (!partner.specUrl) throw new Error("No spec URL configured");
      return fetchSpecFromUrl(partner.specUrl);
    }
    case "git": {
      if (!partner.gitProvider || !partner.gitRepo || !partner.gitSpecPath || !partner.gitInstallToken) {
        throw new Error("Git source incomplete — provider, repo, spec path, and token are all required");
      }
      return fetchSpecFromGit({
        provider: partner.gitProvider as "github" | "gitlab",
        repo: partner.gitRepo,
        branch: partner.gitBranch ?? "main",
        path: partner.gitSpecPath,
        token: decrypt(partner.gitInstallToken), // stored encrypted, decrypt at point-of-use
      });
    }
    case "upload": {
      if (!partner.specRawContent) throw new Error("No uploaded spec content");
      return partner.specRawContent;
    }
    default:
      throw new Error(`Unknown spec source type: ${partner.specSourceType}`);
  }
}

/** Core doc generation: fetch spec → generate docs → persist. */
async function runDocGeneration(partnerId: number): Promise<void> {
  const [partner] = await db
    .select()
    .from(platformPartnersTable)
    .where(eq(platformPartnersTable.id, partnerId))
    .limit(1);
  if (!partner) throw new Error("Partner not found");

  const rawSpec = await fetchRawSpec(partner);
  const previousSpec = partner.specRawContent ?? "";

  // Generate changelog if we already have docs
  let changelog: string | null = null;
  if (partner.docVersion > 0 && previousSpec) {
    changelog = await generateChangelog(previousSpec, rawSpec, partner.name).catch(() => null);
  }

  const portal = await generateDocPortal(rawSpec, partner.name, partner.baseUrl ?? undefined);

  await db
    .update(platformPartnersTable)
    .set({
      docContent: JSON.stringify(portal),
      docGeneratedAt: new Date(),
      docVersion: (partner.docVersion ?? 0) + 1,
      docChangelog: changelog ?? partner.docChangelog,
      // For url/git sources, cache the raw spec so we can diff next time
      ...(partner.specSourceType !== "upload" ? { specRawContent: rawSpec } : {}),
      updatedAt: new Date(),
    })
    .where(eq(platformPartnersTable.id, partnerId));
}

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: Doc portal page
// ─────────────────────────────────────────────────────────────────────────────
router.get("/docs/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const [partner] = await db
    .select()
    .from(platformPartnersTable)
    .where(and(eq(platformPartnersTable.slug, slug), eq(platformPartnersTable.enabled, true)))
    .limit(1);

  if (!partner) { res.status(404).json({ error: "Documentation not found" }); return; }
  if (!partner.docContent) {
    res.status(202).json({ message: "Documentation is being generated. Check back shortly." });
    return;
  }

  res.json({
    partner: {
      id: partner.id,
      name: partner.name,
      slug: partner.slug,
      description: partner.description,
      logoUrl: partner.logoUrl,
      websiteUrl: partner.websiteUrl,
      baseUrl: partner.baseUrl,
      gatewayOptIn: partner.gatewayOptIn,
      pricingTier: partner.pricingTier,
    },
    doc: JSON.parse(partner.docContent),
    docGeneratedAt: partner.docGeneratedAt,
    docVersion: partner.docVersion,
    changelog: partner.docChangelog,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: Git webhooks (HMAC-verified)
// ─────────────────────────────────────────────────────────────────────────────
async function handleGitWebhook(
  req: import("express").Request,
  res: import("express").Response,
  provider: "github" | "gitlab"
): Promise<void> {
  const partnerId = parseInt(req.query.partnerId as string, 10);
  if (isNaN(partnerId)) { res.status(400).json({ error: "partnerId required" }); return; }

  const [partner] = await db
    .select()
    .from(platformPartnersTable)
    .where(and(eq(platformPartnersTable.id, partnerId), eq(platformPartnersTable.gitProvider, provider)))
    .limit(1);

  if (!partner?.gitWebhookSecret) { res.status(404).json({ error: "Partner not found" }); return; }

  // Verify HMAC signature
  const rawBody = req.body as Buffer;
  const sigHeader =
    provider === "github"
      ? (req.headers["x-hub-signature-256"] as string)
      : (req.headers["x-gitlab-token"] as string);

  if (provider === "github") {
    const expected = "sha256=" + crypto.createHmac("sha256", partner.gitWebhookSecret).update(rawBody).digest("hex");
    const sigBuf = Buffer.from(sigHeader ?? "");
    const expBuf = Buffer.from(expected);
    // timingSafeEqual requires same-length buffers; unequal length is itself a mismatch
    const sigOk = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    if (!sigOk) { res.status(401).json({ error: "Invalid signature" }); return; }
  } else {
    // GitLab sends the secret as a plain token header
    const tokenBuf = Buffer.from(sigHeader ?? "");
    const secretBuf = Buffer.from(partner.gitWebhookSecret);
    const tokenOk = tokenBuf.length === secretBuf.length && crypto.timingSafeEqual(tokenBuf, secretBuf);
    if (!tokenOk) { res.status(401).json({ error: "Invalid token" }); return; }
  }

  // Ack immediately; run doc gen in background
  res.json({ queued: true });
  runDocGeneration(partnerId).catch((err) =>
    console.error(`[platform-partners] git webhook doc gen failed for partner ${partnerId}:`, err)
  );
}

router.post(
  "/platform-partners/webhook/github",
  (req, res) => handleGitWebhook(req as import("express").Request, res as import("express").Response, "github")
);
router.post(
  "/platform-partners/webhook/gitlab",
  (req, res) => handleGitWebhook(req as import("express").Request, res as import("express").Response, "gitlab")
);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: Self-service partner registration
// ─────────────────────────────────────────────────────────────────────────────
router.post("/platform-partners/register", async (req, res): Promise<void> => {
  const {
    name, slug, applicantName, contactEmail, websiteUrl, description, logoUrl, baseUrl,
    specSourceType = "url", specUrl, specRawContent,
  } = req.body as Record<string, unknown>;

  if (!name || !slug || !contactEmail) {
    res.status(400).json({ error: "name, slug, and contactEmail are required" }); return;
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(String(slug))) {
    res.status(400).json({ error: "slug must be lowercase letters, numbers, and hyphens only" }); return;
  }

  // Check uniqueness
  const existing = await db
    .select({ id: platformPartnersTable.id })
    .from(platformPartnersTable)
    .where(eq(platformPartnersTable.slug, String(slug)))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "A partner with this slug already exists. Please choose a different one." }); return;
  }

  const [partner] = await db
    .insert(platformPartnersTable)
    .values({
      name: String(name),
      slug: String(slug),
      applicantName: applicantName ? String(applicantName) : null,
      description: description ? String(description) : null,
      logoUrl: logoUrl ? String(logoUrl) : null,
      websiteUrl: websiteUrl ? String(websiteUrl) : null,
      contactEmail: String(contactEmail),
      baseUrl: baseUrl ? String(baseUrl) : null,
      specSourceType: String(specSourceType),
      specUrl: specUrl ? String(specUrl) : null,
      specRawContent: specRawContent ? String(specRawContent) : null,
      applicationStatus: "pending",
      enabled: false,
    })
    .returning({ id: platformPartnersTable.id, slug: platformPartnersTable.slug, name: platformPartnersTable.name });

  res.status(201).json({
    partner,
    message: "Application submitted! Our team will review it and enable your partner listing. We'll reach out to you at " + String(contactEmail) + ".",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: Trusted partners for landing page
// ─────────────────────────────────────────────────────────────────────────────
router.get("/public/trusted-partners", async (_req, res): Promise<void> => {
  const partners = await db
    .select({
      id: platformPartnersTable.id,
      name: platformPartnersTable.name,
      slug: platformPartnersTable.slug,
      logoUrl: platformPartnersTable.logoUrl,
      websiteUrl: platformPartnersTable.websiteUrl,
      description: platformPartnersTable.description,
    })
    .from(platformPartnersTable)
    .where(eq(platformPartnersTable.enabled, true))
    .orderBy(platformPartnersTable.name);

  res.json({ count: partners.length, partners });
});

// PUBLIC: Partner toolkit — shareable page data (slug-based, no auth)
router.get("/platform-partners/:slug/toolkit", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const [partner] = await db
    .select({
      id: platformPartnersTable.id,
      name: platformPartnersTable.name,
      slug: platformPartnersTable.slug,
      logoUrl: platformPartnersTable.logoUrl,
      websiteUrl: platformPartnersTable.websiteUrl,
      description: platformPartnersTable.description,
      applicationStatus: platformPartnersTable.applicationStatus,
      enabled: platformPartnersTable.enabled,
      docVersion: platformPartnersTable.docVersion,
      docGeneratedAt: platformPartnersTable.docGeneratedAt,
      contactEmail: platformPartnersTable.contactEmail,
    })
    .from(platformPartnersTable)
    .where(eq(platformPartnersTable.slug, slug))
    .limit(1);

  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

  // Count connected vendors (only expose number, not identities)
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vendorPlatformConnectionsTable)
    .where(and(
      eq(vendorPlatformConnectionsTable.partnerId, partner.id),
      eq(vendorPlatformConnectionsTable.status, "active")
    ));

  res.json({
    partner,
    connectedVendors: countRow?.count ?? 0,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR: Marketplace listing
// ─────────────────────────────────────────────────────────────────────────────
router.get("/marketplace", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendorId = await resolveVendorId(userId);

  const partners = await db
    .select()
    .from(platformPartnersTable)
    .where(eq(platformPartnersTable.enabled, true))
    .orderBy(platformPartnersTable.name);

  let connections: typeof vendorPlatformConnectionsTable.$inferSelect[] = [];
  if (vendorId) {
    connections = await db
      .select()
      .from(vendorPlatformConnectionsTable)
      .where(eq(vendorPlatformConnectionsTable.vendorId, vendorId));
  }

  const connectionMap = new Map(connections.map((c) => [c.partnerId, c]));

  res.json({
    partners: partners.map((p) => {
      const conn = connectionMap.get(p.id);
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        logoUrl: p.logoUrl,
        websiteUrl: p.websiteUrl,
        baseUrl: p.gatewayOptIn ? null : p.baseUrl, // hide direct URL if gateway opt-in
        pricingTier: p.pricingTier,
        hasDoc: !!p.docContent,
        connection: conn
          ? { status: conn.status, authType: conn.authType, connectedAt: conn.connectedAt }
          : null,
      };
    }),
  });
});

// Vendor connects to a platform partner
router.post("/marketplace/:partnerId/connect", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const partnerId = parseInt(req.params.partnerId, 10);
  const { authType = "api_key", credential } = req.body as { authType?: string; credential?: string };

  const vendorId = await resolveVendorId(userId);
  if (!vendorId) { res.status(400).json({ error: "Vendor profile not found" }); return; }

  const [partner] = await db
    .select({ id: platformPartnersTable.id, enabled: platformPartnersTable.enabled })
    .from(platformPartnersTable)
    .where(eq(platformPartnersTable.id, partnerId))
    .limit(1);
  if (!partner?.enabled) { res.status(404).json({ error: "Partner not found" }); return; }

  // Upsert connection
  const existing = await db
    .select({ id: vendorPlatformConnectionsTable.id })
    .from(vendorPlatformConnectionsTable)
    .where(
      and(
        eq(vendorPlatformConnectionsTable.vendorId, vendorId),
        eq(vendorPlatformConnectionsTable.partnerId, partnerId)
      )
    )
    .limit(1);

  // Encrypt credential before storing — never persist API keys or OAuth tokens in plaintext.
  const encryptedCredential = credential ? encrypt(credential) : null;

  if (existing.length > 0) {
    await db
      .update(vendorPlatformConnectionsTable)
      .set({ authType, credential: encryptedCredential, status: "active", lastError: null, updatedAt: new Date() })
      .where(eq(vendorPlatformConnectionsTable.id, existing[0].id));
  } else {
    await db.insert(vendorPlatformConnectionsTable).values({
      vendorId,
      partnerId,
      authType,
      credential: encryptedCredential,
      status: "active",
    });
  }

  res.json({ connected: true });
});

// Vendor disconnects from a platform partner
router.delete("/marketplace/:partnerId/connect", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const partnerId = parseInt(req.params.partnerId, 10);
  const vendorId = await resolveVendorId(userId);
  if (!vendorId) { res.status(400).json({ error: "Vendor profile not found" }); return; }

  await db
    .delete(vendorPlatformConnectionsTable)
    .where(
      and(
        eq(vendorPlatformConnectionsTable.vendorId, vendorId),
        eq(vendorPlatformConnectionsTable.partnerId, partnerId)
      )
    );

  res.json({ disconnected: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Platform Partner CRUD
// ─────────────────────────────────────────────────────────────────────────────
router.get("/admin/platform-partners", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) { res.status(403).json({ error: "Admin access required" }); return; }

  const partners = await db
    .select()
    .from(platformPartnersTable)
    .orderBy(desc(platformPartnersTable.createdAt));

  // Attach connection counts
  const counts = await db
    .select({
      partnerId: vendorPlatformConnectionsTable.partnerId,
      count: sql<number>`count(*)::int`,
    })
    .from(vendorPlatformConnectionsTable)
    .where(eq(vendorPlatformConnectionsTable.status, "active"))
    .groupBy(vendorPlatformConnectionsTable.partnerId);

  const countMap = new Map(counts.map((c) => [c.partnerId, c.count]));

  res.json({
    partners: partners.map((p) => ({
      ...p,
      gitInstallToken: undefined, // never expose token
      connectedVendors: countMap.get(p.id) ?? 0,
    })),
  });
});

router.post("/admin/platform-partners", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) { res.status(403).json({ error: "Admin access required" }); return; }

  const {
    name, slug, description, logoUrl, websiteUrl, contactEmail, pricingTier = "free",
    baseUrl, gatewayOptIn = false,
    specSourceType = "url", specUrl, specRawContent,
    gitProvider, gitRepo, gitBranch = "main", gitSpecPath, gitInstallToken,
  } = req.body as Record<string, unknown>;

  if (!name || !slug || !contactEmail) {
    res.status(400).json({ error: "name, slug, and contactEmail are required" }); return;
  }

  // Generate a webhook secret for Git-connected partners
  const gitWebhookSecret = gitProvider ? crypto.randomBytes(32).toString("hex") : null;

  const [partner] = await db
    .insert(platformPartnersTable)
    .values({
      name: String(name),
      slug: String(slug),
      description: description ? String(description) : null,
      logoUrl: logoUrl ? String(logoUrl) : null,
      websiteUrl: websiteUrl ? String(websiteUrl) : null,
      contactEmail: String(contactEmail),
      pricingTier: String(pricingTier),
      baseUrl: baseUrl ? String(baseUrl) : null,
      gatewayOptIn: Boolean(gatewayOptIn),
      specSourceType: String(specSourceType),
      specUrl: specUrl ? String(specUrl) : null,
      specRawContent: specRawContent ? String(specRawContent) : null,
      gitProvider: gitProvider ? String(gitProvider) : null,
      gitRepo: gitRepo ? String(gitRepo) : null,
      gitBranch: String(gitBranch),
      gitSpecPath: gitSpecPath ? String(gitSpecPath) : null,
      gitInstallToken: gitInstallToken ? encrypt(String(gitInstallToken)) : null,
      gitWebhookSecret,
      enabled: false,
    })
    .returning();

  res.status(201).json({ partner: { ...partner, gitInstallToken: undefined } });
});

router.get("/admin/platform-partners/:id", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) { res.status(403).json({ error: "Admin access required" }); return; }

  const id = parseInt(req.params.id, 10);
  const [partner] = await db
    .select()
    .from(platformPartnersTable)
    .where(eq(platformPartnersTable.id, id))
    .limit(1);

  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }
  res.json({ partner: { ...partner, gitInstallToken: undefined } });
});

router.put("/admin/platform-partners/:id", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) { res.status(403).json({ error: "Admin access required" }); return; }

  const id = parseInt(req.params.id, 10);
  const {
    name, slug, description, logoUrl, websiteUrl, contactEmail, pricingTier,
    baseUrl, gatewayOptIn, specSourceType, specUrl, specRawContent,
    gitProvider, gitRepo, gitBranch, gitSpecPath, gitInstallToken,
    enabled,
  } = req.body as Record<string, unknown>;

  const updates: Partial<typeof platformPartnersTable.$inferInsert> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = String(name);
  if (slug !== undefined) updates.slug = String(slug);
  if (description !== undefined) updates.description = description ? String(description) : null;
  if (logoUrl !== undefined) updates.logoUrl = logoUrl ? String(logoUrl) : null;
  if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl ? String(websiteUrl) : null;
  if (contactEmail !== undefined) updates.contactEmail = String(contactEmail);
  if (pricingTier !== undefined) updates.pricingTier = String(pricingTier);
  if (baseUrl !== undefined) updates.baseUrl = baseUrl ? String(baseUrl) : null;
  if (gatewayOptIn !== undefined) updates.gatewayOptIn = Boolean(gatewayOptIn);
  if (specSourceType !== undefined) updates.specSourceType = String(specSourceType);
  if (specUrl !== undefined) updates.specUrl = specUrl ? String(specUrl) : null;
  if (specRawContent !== undefined) updates.specRawContent = specRawContent ? String(specRawContent) : null;
  if (gitProvider !== undefined) updates.gitProvider = gitProvider ? String(gitProvider) : null;
  if (gitRepo !== undefined) updates.gitRepo = gitRepo ? String(gitRepo) : null;
  if (gitBranch !== undefined) updates.gitBranch = String(gitBranch);
  if (gitSpecPath !== undefined) updates.gitSpecPath = gitSpecPath ? String(gitSpecPath) : null;
  // Only overwrite the stored token if the caller sends a non-empty replacement.
  // A blank string (from the edit form's "leave blank to keep" placeholder) must
  // never wipe the existing token. Encrypt before storing.
  if (gitInstallToken !== undefined && String(gitInstallToken).trim() !== "") {
    updates.gitInstallToken = encrypt(String(gitInstallToken));
  }
  if (enabled !== undefined) updates.enabled = Boolean(enabled);

  const [updated] = await db
    .update(platformPartnersTable)
    .set(updates)
    .where(eq(platformPartnersTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Partner not found" }); return; }
  res.json({ partner: { ...updated, gitInstallToken: undefined } });
});

router.delete("/admin/platform-partners/:id", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) { res.status(403).json({ error: "Admin access required" }); return; }

  const id = parseInt(req.params.id, 10);
  await db.delete(platformPartnersTable).where(eq(platformPartnersTable.id, id));
  res.json({ deleted: true });
});

// Approve a pending application
router.post("/admin/platform-partners/:id/approve", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) { res.status(403).json({ error: "Admin access required" }); return; }

  const id = parseInt(req.params.id, 10);
  const [updated] = await db
    .update(platformPartnersTable)
    .set({ applicationStatus: "approved", enabled: true, updatedAt: new Date() })
    .where(eq(platformPartnersTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Partner not found" }); return; }

  // Trigger doc generation in background if a spec source is configured
  if (updated.specSourceType === "upload" ? updated.specRawContent : (updated.specUrl || updated.gitRepo)) {
    runDocGeneration(id).catch((err) =>
      console.error(`[platform-partners] auto doc gen on approval failed for partner ${id}:`, err)
    );
  }

  res.json({ partner: { ...updated, gitInstallToken: undefined }, message: "Partner approved and enabled." });
});

// Reject a pending application
router.post("/admin/platform-partners/:id/reject", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) { res.status(403).json({ error: "Admin access required" }); return; }

  const id = parseInt(req.params.id, 10);
  const { reason } = req.body as { reason?: string };

  const [updated] = await db
    .update(platformPartnersTable)
    .set({ applicationStatus: "rejected", enabled: false, rejectionReason: reason ?? null, updatedAt: new Date() })
    .where(eq(platformPartnersTable.id, id))
    .returning({ id: platformPartnersTable.id, applicationStatus: platformPartnersTable.applicationStatus });

  if (!updated) { res.status(404).json({ error: "Partner not found" }); return; }
  res.json({ partner: updated, message: "Application rejected." });
});

// Trigger AI doc generation
router.post("/admin/platform-partners/:id/generate-docs", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) { res.status(403).json({ error: "Admin access required" }); return; }

  const id = parseInt(req.params.id, 10);

  // Ack immediately; run in background
  res.json({ queued: true, message: "Doc generation started. Refresh in a few seconds." });
  runDocGeneration(id).catch((err) =>
    console.error(`[platform-partners] manual doc gen failed for partner ${id}:`, err)
  );
});

// Enable / disable a partner
router.post("/admin/platform-partners/:id/enable", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) { res.status(403).json({ error: "Admin access required" }); return; }

  const id = parseInt(req.params.id, 10);
  const { enabled } = req.body as { enabled: boolean };

  const [updated] = await db
    .update(platformPartnersTable)
    .set({ enabled: Boolean(enabled), updatedAt: new Date() })
    .where(eq(platformPartnersTable.id, id))
    .returning({ id: platformPartnersTable.id, enabled: platformPartnersTable.enabled });

  if (!updated) { res.status(404).json({ error: "Partner not found" }); return; }
  res.json({ partner: updated });
});

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS: Connection stats for a platform partner (admin or future partner auth)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/platform-partners/:id/analytics", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !isAdmin(userId)) { res.status(403).json({ error: "Admin access required" }); return; }

  const id = parseInt(req.params.id, 10);

  const [partner] = await db
    .select({
      id: platformPartnersTable.id,
      name: platformPartnersTable.name,
      docVersion: platformPartnersTable.docVersion,
      docGeneratedAt: platformPartnersTable.docGeneratedAt,
    })
    .from(platformPartnersTable)
    .where(eq(platformPartnersTable.id, id))
    .limit(1);

  if (!partner) { res.status(404).json({ error: "Partner not found" }); return; }

  const connections = await db
    .select({
      id: vendorPlatformConnectionsTable.id,
      vendorId: vendorPlatformConnectionsTable.vendorId,
      status: vendorPlatformConnectionsTable.status,
      authType: vendorPlatformConnectionsTable.authType,
      connectedAt: vendorPlatformConnectionsTable.connectedAt,
      lastSeenAt: vendorPlatformConnectionsTable.lastSeenAt,
      lastError: vendorPlatformConnectionsTable.lastError,
    })
    .from(vendorPlatformConnectionsTable)
    .where(eq(vendorPlatformConnectionsTable.partnerId, id))
    .orderBy(desc(vendorPlatformConnectionsTable.connectedAt));

  const active = connections.filter((c) => c.status === "active").length;
  const errors = connections.filter((c) => c.status === "error").length;

  res.json({
    partner,
    stats: { total: connections.length, active, errors },
    connections,
  });
});

export default router;
