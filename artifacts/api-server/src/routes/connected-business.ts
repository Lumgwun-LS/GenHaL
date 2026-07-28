/**
 * Connected Business — vendor-facing routes that let a vendor register their
 * own website/platform as a "Connected Business" in the Awa Biz Suite ecosystem.
 *
 * After signing up as a normal vendor the owner connects their GitHub, GitLab,
 * or Bitbucket repo; the Awajimaa AI reads the codebase and generates full
 * API documentation automatically. They can set a custom base URL or use the
 * default awajimaaai.com gateway, then share a permanent docs link anywhere.
 *
 * All routes require Clerk auth — handled by requireAuth in index.ts.
 *
 *   GET    /connected-business/profile       — get vendor's CB profile (if any)
 *   POST   /connected-business/setup         — create CB profile (idempotent)
 *   PATCH  /connected-business/profile       — update name, desc, logo, URLs, plan
 *   POST   /connected-business/vcs           — connect / update VCS credentials
 *   DELETE /connected-business/vcs           — disconnect VCS
 *   POST   /connected-business/generate-docs — trigger AI doc regeneration
 */

import { Router } from "express";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  db,
  platformPartnersTable,
  vendorsTable,
} from "@workspace/db";
import {
  fetchSpecFromGit,
  fetchSpecFromUrl,
  generateDocPortal,
  generateChangelog,
} from "../lib/doc-generator";
import { encrypt, decrypt } from "../lib/encryption";

const router = Router();
export default router;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolveVendor(userId: string) {
  const [v] = await db
    .select({ id: vendorsTable.id, name: vendorsTable.businessName, email: vendorsTable.email })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, userId))
    .limit(1);
  return v ?? null;
}

async function getProfile(vendorId: number) {
  const [row] = await db
    .select()
    .from(platformPartnersTable)
    .where(eq(platformPartnersTable.vendorId, vendorId))
    .limit(1);
  return row ?? null;
}

function safeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Fetch the raw spec (git, url, or upload) for an existing profile row. */
async function fetchRawSpec(profile: typeof platformPartnersTable.$inferSelect): Promise<string> {
  switch (profile.specSourceType) {
    case "url":
      if (!profile.specUrl) throw new Error("No spec URL configured");
      return fetchSpecFromUrl(profile.specUrl);
    case "git": {
      if (!profile.gitRepo) throw new Error("No git repository configured");
      const token = profile.gitInstallToken ? decrypt(profile.gitInstallToken) : undefined;
      return fetchSpecFromGit(
        profile.gitProvider ?? "github",
        profile.gitRepo,
        profile.gitBranch ?? "main",
        profile.gitSpecPath ?? undefined,
        token,
      );
    }
    case "upload":
      if (!profile.specRawContent) throw new Error("No uploaded spec found");
      return profile.specRawContent;
    default:
      throw new Error(`Unknown spec source type: ${profile.specSourceType}`);
  }
}

// ─── GET /connected-business/profile ─────────────────────────────────────────

router.get("/connected-business/profile", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await resolveVendor(userId);
  if (!vendor) { res.status(400).json({ error: "Vendor profile not found" }); return; }

  const profile = await getProfile(vendor.id);
  if (!profile) { res.json({ profile: null }); return; }

  res.json({
    profile: {
      id: profile.id,
      name: profile.name,
      slug: profile.slug,
      description: profile.description,
      logoUrl: profile.logoUrl,
      websiteUrl: profile.websiteUrl,
      baseUrl: profile.baseUrl,
      gatewayOptIn: profile.gatewayOptIn,
      specSourceType: profile.specSourceType,
      specUrl: profile.specUrl,
      gitProvider: profile.gitProvider,
      gitRepo: profile.gitRepo,
      gitBranch: profile.gitBranch,
      gitSpecPath: profile.gitSpecPath,
      // never expose the encrypted token
      hasGitToken: !!profile.gitInstallToken,
      applicationStatus: profile.applicationStatus,
      enabled: profile.enabled,
      docVersion: profile.docVersion,
      docGeneratedAt: profile.docGeneratedAt?.toISOString() ?? null,
      docChangelog: profile.docChangelog,
      createdAt: profile.createdAt.toISOString(),
    },
  });
});

// ─── POST /connected-business/setup ─────────────────────────────────────────

router.post("/connected-business/setup", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await resolveVendor(userId);
  if (!vendor) { res.status(400).json({ error: "Vendor profile not found" }); return; }

  // Idempotent: return existing if already set up
  const existing = await getProfile(vendor.id);
  if (existing) {
    res.json({ profile: { id: existing.id, slug: existing.slug, applicationStatus: existing.applicationStatus } });
    return;
  }

  const {
    name,
    description,
    logoUrl,
    websiteUrl,
    contactEmail,
    baseUrl,
    gatewayOptIn = false,
  } = req.body as {
    name: string;
    description?: string;
    logoUrl?: string;
    websiteUrl?: string;
    contactEmail?: string;
    baseUrl?: string;
    gatewayOptIn?: boolean;
  };

  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }

  // Ensure slug is unique
  let slug = safeSlug(name);
  const [collision] = await db
    .select({ id: platformPartnersTable.id })
    .from(platformPartnersTable)
    .where(eq(platformPartnersTable.slug, slug))
    .limit(1);
  if (collision) slug = `${slug}-${vendor.id}`;

  const [created] = await db
    .insert(platformPartnersTable)
    .values({
      name: name.trim(),
      slug,
      description: description ?? null,
      logoUrl: logoUrl ?? null,
      websiteUrl: websiteUrl ?? null,
      contactEmail: contactEmail ?? vendor.email,
      baseUrl: baseUrl ?? null,
      gatewayOptIn: !!gatewayOptIn,
      applicationStatus: "vendor_connected",
      applicantName: vendor.name ?? null,
      vendorId: vendor.id,
      enabled: true, // vendor-created profiles are immediately visible
    })
    .returning({ id: platformPartnersTable.id, slug: platformPartnersTable.slug });

  res.status(201).json({ profile: { id: created.id, slug: created.slug, applicationStatus: "vendor_connected" } });
});

// ─── PATCH /connected-business/profile ───────────────────────────────────────

router.patch("/connected-business/profile", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await resolveVendor(userId);
  if (!vendor) { res.status(400).json({ error: "Vendor profile not found" }); return; }

  const profile = await getProfile(vendor.id);
  if (!profile) { res.status(404).json({ error: "Connected Business profile not found. Call /setup first." }); return; }

  const {
    name,
    description,
    logoUrl,
    websiteUrl,
    contactEmail,
    baseUrl,
    gatewayOptIn,
    specUrl,
  } = req.body as Record<string, string | boolean | undefined>;

  const updates: Partial<typeof platformPartnersTable.$inferInsert> = { updatedAt: new Date() };
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) { res.status(400).json({ error: "name must be a non-empty string" }); return; }
    updates.name = name.trim();
  }
  if (description !== undefined) updates.description = description as string | null;
  if (logoUrl !== undefined) updates.logoUrl = logoUrl as string | null;
  if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl as string | null;
  if (contactEmail !== undefined) updates.contactEmail = contactEmail as string;
  if (baseUrl !== undefined) updates.baseUrl = baseUrl as string | null;
  if (gatewayOptIn !== undefined) updates.gatewayOptIn = Boolean(gatewayOptIn);
  if (specUrl !== undefined) { updates.specUrl = specUrl as string | null; updates.specSourceType = "url"; }

  await db.update(platformPartnersTable).set(updates).where(eq(platformPartnersTable.id, profile.id));
  res.json({ ok: true });
});

// ─── POST /connected-business/vcs ────────────────────────────────────────────

router.post("/connected-business/vcs", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await resolveVendor(userId);
  if (!vendor) { res.status(400).json({ error: "Vendor profile not found" }); return; }

  const profile = await getProfile(vendor.id);
  if (!profile) { res.status(404).json({ error: "Connected Business profile not found. Call /setup first." }); return; }

  const {
    gitProvider,
    gitRepo,
    gitBranch = "main",
    gitSpecPath,
    accessToken,
  } = req.body as {
    gitProvider: string;
    gitRepo: string;
    gitBranch?: string;
    gitSpecPath?: string;
    accessToken?: string;
  };

  const allowed = ["github", "gitlab", "bitbucket"];
  if (!gitProvider || !allowed.includes(gitProvider)) {
    res.status(400).json({ error: `gitProvider must be one of: ${allowed.join(", ")}` });
    return;
  }
  if (!gitRepo?.trim()) { res.status(400).json({ error: "gitRepo (owner/repo) is required" }); return; }

  const updates: Partial<typeof platformPartnersTable.$inferInsert> = {
    specSourceType: "git",
    gitProvider,
    gitRepo: gitRepo.trim(),
    gitBranch: gitBranch || "main",
    gitSpecPath: gitSpecPath ?? null,
    updatedAt: new Date(),
  };

  // Only overwrite the stored token if a new one is provided
  if (accessToken) {
    updates.gitInstallToken = encrypt(accessToken);
  }

  await db.update(platformPartnersTable).set(updates).where(eq(platformPartnersTable.id, profile.id));
  res.json({ ok: true, gitProvider, gitRepo: gitRepo.trim(), gitBranch: gitBranch || "main" });
});

// ─── DELETE /connected-business/vcs ──────────────────────────────────────────

router.delete("/connected-business/vcs", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await resolveVendor(userId);
  if (!vendor) { res.status(400).json({ error: "Vendor profile not found" }); return; }

  const profile = await getProfile(vendor.id);
  if (!profile) { res.status(404).json({ error: "Connected Business profile not found" }); return; }

  await db.update(platformPartnersTable).set({
    gitProvider: null,
    gitRepo: null,
    gitInstallToken: null,
    gitWebhookSecret: null,
    specSourceType: "url",
    updatedAt: new Date(),
  }).where(eq(platformPartnersTable.id, profile.id));

  res.json({ ok: true });
});

// ─── POST /connected-business/generate-docs ──────────────────────────────────

router.post("/connected-business/generate-docs", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await resolveVendor(userId);
  if (!vendor) { res.status(400).json({ error: "Vendor profile not found" }); return; }

  const profile = await getProfile(vendor.id);
  if (!profile) { res.status(404).json({ error: "Connected Business profile not found. Call /setup first." }); return; }

  // Determine spec source
  const hasGit = profile.specSourceType === "git" && profile.gitRepo;
  const hasUrl = profile.specSourceType === "url" && profile.specUrl;
  const hasUpload = profile.specSourceType === "upload" && profile.specRawContent;

  if (!hasGit && !hasUrl && !hasUpload) {
    res.status(400).json({
      error: "No spec source configured. Connect a Git repo, provide a spec URL, or upload a spec file first.",
    });
    return;
  }

  try {
    const rawSpec = await fetchRawSpec(profile);
    const previousDoc = profile.docContent ?? undefined;
    const [docPortal, changelog] = await Promise.all([
      generateDocPortal(profile.name, profile.description ?? "", rawSpec),
      previousDoc ? generateChangelog(previousDoc, rawSpec) : Promise.resolve(null),
    ]);

    await db.update(platformPartnersTable).set({
      docContent: JSON.stringify(docPortal),
      docGeneratedAt: new Date(),
      docVersion: (profile.docVersion ?? 0) + 1,
      docChangelog: changelog ?? profile.docChangelog,
      updatedAt: new Date(),
    }).where(eq(platformPartnersTable.id, profile.id));

    res.json({
      ok: true,
      docVersion: (profile.docVersion ?? 0) + 1,
      changelog: changelog ?? null,
      slug: profile.slug,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Doc generation failed: ${message}` });
  }
});
