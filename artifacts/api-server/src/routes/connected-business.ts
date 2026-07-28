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
import { createHash, randomBytes } from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  db,
  platformPartnersTable,
  vendorsTable,
  vendorApiKeysTable,
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
    .select({ id: vendorsTable.id, name: vendorsTable.businessName, email: vendorsTable.email, subscriptionTier: vendorsTable.subscriptionTier })
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
      subscriptionTier: vendor.subscriptionTier ?? "free",
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

// ─── GET /connected-business/embed-key ───────────────────────────────────────
// Get (or auto-create) the vendor's "Connected Business Embed" API key.
// Returns masked prefix + id. Raw key only returned once at creation.

router.get("/connected-business/embed-key", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const vendor = await resolveVendor(userId);
  if (!vendor) { res.status(400).json({ error: "Vendor profile not found" }); return; }

  const CB_KEY_NAME = "Connected Business Embed";
  const [existing] = await db
    .select({ id: vendorApiKeysTable.id, prefix: vendorApiKeysTable.prefix, isActive: vendorApiKeysTable.isActive, createdAt: vendorApiKeysTable.createdAt })
    .from(vendorApiKeysTable)
    .where(and(
      eq(vendorApiKeysTable.vendorId, vendor.id),
      eq(vendorApiKeysTable.name, CB_KEY_NAME),
      isNull(vendorApiKeysTable.revokedAt),
    ))
    .limit(1);

  if (existing) {
    res.json({ key: { id: existing.id, prefix: existing.prefix, masked: `${existing.prefix}${"•".repeat(28)}`, isActive: existing.isActive, createdAt: existing.createdAt } });
    return;
  }

  // Auto-create on first access
  const rawKey = `awa_sk_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const prefix = rawKey.slice(0, 12);
  const [created] = await db.insert(vendorApiKeysTable).values({
    vendorId: vendor.id,
    name: CB_KEY_NAME,
    keyHash,
    prefix,
    scopes: ["read", "embed"],
    isActive: true,
  }).returning({ id: vendorApiKeysTable.id, prefix: vendorApiKeysTable.prefix, createdAt: vendorApiKeysTable.createdAt });

  res.status(201).json({
    key: { id: created.id, prefix: created.prefix, masked: `${created.prefix}${"•".repeat(28)}`, isActive: true, createdAt: created.createdAt },
    rawKey, // returned ONCE — client must save it
    isNew: true,
  });
});

// ─── POST /connected-business/embed-key/rotate ───────────────────────────────

router.post("/connected-business/embed-key/rotate", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const vendor = await resolveVendor(userId);
  if (!vendor) { res.status(400).json({ error: "Vendor profile not found" }); return; }

  const CB_KEY_NAME = "Connected Business Embed";

  // Revoke existing
  await db.update(vendorApiKeysTable)
    .set({ isActive: false, revokedAt: new Date() })
    .where(and(eq(vendorApiKeysTable.vendorId, vendor.id), eq(vendorApiKeysTable.name, CB_KEY_NAME)));

  // Create new
  const rawKey = `awa_sk_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const prefix = rawKey.slice(0, 12);
  const [created] = await db.insert(vendorApiKeysTable).values({
    vendorId: vendor.id,
    name: CB_KEY_NAME,
    keyHash,
    prefix,
    scopes: ["read", "embed"],
    isActive: true,
  }).returning({ id: vendorApiKeysTable.id, prefix: vendorApiKeysTable.prefix, createdAt: vendorApiKeysTable.createdAt });

  res.json({
    key: { id: created.id, prefix: created.prefix, masked: `${created.prefix}${"•".repeat(28)}`, isActive: true, createdAt: created.createdAt },
    rawKey,
    isNew: true,
  });
});

// ─── POST /connected-business/push-integration ───────────────────────────────
// Push integration scaffold code to the vendor's connected Git repository.
// Creates a new branch + opens a Pull Request / Merge Request.

router.post("/connected-business/push-integration", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const vendor = await resolveVendor(userId);
  if (!vendor) { res.status(400).json({ error: "Vendor profile not found" }); return; }

  const profile = await getProfile(vendor.id);
  if (!profile) { res.status(404).json({ error: "Connected Business profile not found" }); return; }
  if (!profile.gitRepo || !profile.gitInstallToken) {
    res.status(400).json({ error: "Connect a Git repository with an access token first (VCS tab)" });
    return;
  }

  const { embedKey } = req.body as { embedKey?: string };
  if (!embedKey?.startsWith("awa_sk_")) {
    res.status(400).json({ error: "Provide your embedKey (awa_sk_...) in the request body" });
    return;
  }

  const token = decrypt(profile.gitInstallToken);
  const provider = profile.gitProvider ?? "github";
  const [owner, repo] = (profile.gitRepo ?? "").split("/");
  const baseBranch = profile.gitBranch ?? "main";
  const host = process.env.SITE_BASE_URL ?? "https://awajimaaai.com";
  const newBranch = "awa-integration";

  const files = buildIntegrationFiles(profile.name, embedKey, host);

  try {
    let prUrl: string;
    if (provider === "github") {
      prUrl = await pushToGitHub({ token, owner, repo, baseBranch, newBranch, files });
    } else if (provider === "gitlab") {
      prUrl = await pushToGitLab({ token, owner, repo, baseBranch, newBranch, files });
    } else {
      prUrl = await pushToBitbucket({ token, owner, repo, baseBranch, newBranch, files });
    }
    res.json({ ok: true, prUrl, branch: newBranch });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Git push failed: ${msg}` });
  }
});

// ── Git push helpers ──────────────────────────────────────────────────────────

async function gitFetch(url: string, opts: RequestInit) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.json() as Promise<Record<string, unknown>>;
}

type PushParams = {
  token: string; owner: string; repo: string; baseBranch: string; newBranch: string;
  files: Array<{ path: string; content: string }>;
};

async function pushToGitHub(p: PushParams) {
  const base = `https://api.github.com/repos/${p.owner}/${p.repo}`;
  const headers = { Authorization: `Bearer ${p.token}`, "Content-Type": "application/json", Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

  const refData = await gitFetch(`${base}/git/refs/heads/${p.baseBranch}`, { headers });
  const sha = (refData.object as Record<string, unknown>)?.sha as string;

  try {
    await gitFetch(`${base}/git/refs`, { method: "POST", headers, body: JSON.stringify({ ref: `refs/heads/${p.newBranch}`, sha }) });
  } catch (e: unknown) {
    if (!(e instanceof Error) || !e.message.includes("422")) throw e;
  }

  for (const f of p.files) {
    let existingSha: string | undefined;
    try {
      const existing = await gitFetch(`${base}/contents/${f.path}?ref=${p.newBranch}`, { headers });
      existingSha = existing.sha as string | undefined;
    } catch { /* new file */ }
    await gitFetch(`${base}/contents/${f.path}`, {
      method: "PUT", headers,
      body: JSON.stringify({ message: "feat: add Awa Biz Suite product showcase & integration", content: btoa(unescape(encodeURIComponent(f.content))), branch: p.newBranch, ...(existingSha ? { sha: existingSha } : {}) }),
    });
  }

  const prBody = [
    "## Awa Biz Suite — Product Showcase & Embedded Services",
    "",
    "This PR adds your live product catalog and services widget to your platform.",
    "",
    "**Files added:**",
    ...p.files.map(f => `- \`${f.path}\``),
    "",
    "See `awa-integration/README.md` for setup instructions.",
    "",
    "Generated by [Awa Biz Suite Connected Business](https://awajimaaai.com).",
  ].join("\n");

  const pr = await gitFetch(`${base}/pulls`, {
    method: "POST", headers,
    body: JSON.stringify({ title: "feat: Awa Biz Suite product showcase & integration", body: prBody, head: p.newBranch, base: p.baseBranch }),
  });
  return pr.html_url as string;
}

async function pushToGitLab(p: PushParams) {
  const projectId = encodeURIComponent(`${p.owner}/${p.repo}`);
  const base = `https://gitlab.com/api/v4/projects/${projectId}`;
  const headers = { "PRIVATE-TOKEN": p.token, "Content-Type": "application/json" };

  try {
    await gitFetch(`${base}/repository/branches`, { method: "POST", headers, body: JSON.stringify({ branch: p.newBranch, ref: p.baseBranch }) });
  } catch (e: unknown) {
    if (!(e instanceof Error) || !e.message.includes("400")) throw e;
  }

  for (const f of p.files) {
    const encodedPath = encodeURIComponent(f.path);
    const payload = { branch: p.newBranch, content: f.content, commit_message: "feat: add Awa Biz Suite product showcase & integration" };
    try {
      await gitFetch(`${base}/repository/files/${encodedPath}`, { method: "POST", headers, body: JSON.stringify(payload) });
    } catch {
      await gitFetch(`${base}/repository/files/${encodedPath}`, { method: "PUT", headers, body: JSON.stringify(payload) });
    }
  }

  const mr = await gitFetch(`${base}/merge_requests`, {
    method: "POST", headers,
    body: JSON.stringify({ title: "feat: Awa Biz Suite product showcase & integration", source_branch: p.newBranch, target_branch: p.baseBranch, description: "Adds live product catalog + embedded services. See awa-integration/README.md." }),
  });
  return mr.web_url as string;
}

async function pushToBitbucket(p: PushParams) {
  const base = `https://api.bitbucket.org/2.0/repositories/${p.owner}/${p.repo}`;
  const form = new URLSearchParams();
  for (const f of p.files) form.append(f.path, f.content);
  form.append("branch", p.newBranch);
  form.append("message", "feat: add Awa Biz Suite product showcase & integration");
  await gitFetch(`${base}/src`, { method: "POST", headers: { Authorization: `Bearer ${p.token}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });

  const pr = await gitFetch(`${base}/pullrequests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "feat: Awa Biz Suite product showcase & integration", source: { branch: { name: p.newBranch } }, destination: { branch: { name: p.baseBranch } }, description: "Adds live product catalog + embedded services." }),
  });
  return (pr.links as Record<string, unknown> & { html: { href: string } }).html.href;
}

// ── Integration file content ───────────────────────────────────────────────────

function buildIntegrationFiles(platformName: string, embedKey: string, host: string) {
  return [
    { path: "awa-integration/README.md",                          content: buildReadme(platformName, embedKey, host) },
    { path: "awa-integration/embed.html",                          content: buildHtmlSnippet(embedKey, host) },
    { path: "awa-integration/AwaWidget.jsx",                       content: buildReactSnippet(embedKey, host) },
    { path: "awa-integration/AwaWidget.native.jsx",                content: buildReactNativeSnippet(embedKey, host) },
    { path: "awa-integration/products/AwaProducts.jsx",            content: buildAwaProductsJsx(embedKey, host) },
    { path: "awa-integration/products/AwaProductSlider.jsx",       content: buildAwaProductSliderJsx(embedKey, host) },
    { path: "awa-integration/products/AwaProductList.native.jsx",  content: buildAwaProductListNative(embedKey, host) },
  ];
}

function buildReadme(platformName: string, embedKey: string, host: string) {
  return `# Awa Biz Suite — Connected Business Integration

This directory contains everything you need to embed **Awa Biz Suite** services and your
live product catalog directly into **${platformName}**.

## What this gives you

- 🛍️ **Product Showcase** — grid, carousel, or featured layout. Pulls your live Awa product catalog.
- ⚡ **Services Widget** — floating button that gives visitors access to payments, orders, support, and more.
- 📦 No backend required — everything works with a single API key.
- 📱 Works on websites (HTML/React/Vue) and mobile apps (React Native / Expo).

## Your API Key

\`\`\`
${embedKey}
\`\`\`

> This key has **read + embed** scope only — safe for frontend use.
> Do not use your master admin key here.

---

## 1. Product Showcase (drop anywhere on your page)

### HTML

\`\`\`html
<!-- Grid layout -->
<div
  data-awa="products"
  data-key="${embedKey}"
  data-view="grid"
  data-columns="3"
  data-limit="9"
  data-title="Our Products"
  data-cta="Buy Now">
</div>

<!-- Carousel / Slider -->
<div
  data-awa="products"
  data-key="${embedKey}"
  data-view="slider"
  data-title="Featured Products">
</div>

<!-- Featured (hero + grid) -->
<div
  data-awa="products"
  data-key="${embedKey}"
  data-view="featured"
  data-title="Our Products">
</div>

<script src="${host}/api/embed.js" data-key="${embedKey}" data-hide-widget="true"></script>
\`\`\`

See \`products/AwaProducts.jsx\` and \`products/AwaProductSlider.jsx\` for React components.
See \`products/AwaProductList.native.jsx\` for React Native.

---

## 2. Services Widget (floating button)

\`\`\`html
<script
  src="${host}/api/embed.js"
  data-key="${embedKey}"
  data-theme="dark"
  data-label="Services"
  data-position="bottom-right">
</script>
\`\`\`

---

## Script Tag Options

| Attribute | Default | Description |
|-----------|---------|-------------|
| \`data-key\` | — | **Required.** Your API key |
| \`data-theme\` | \`dark\` | \`dark\` or \`light\` |
| \`data-label\` | \`Services\` | Floating button text |
| \`data-position\` | \`bottom-right\` | \`bottom-right\` or \`bottom-left\` |
| \`data-hide-widget\` | \`false\` | \`true\` to hide floating button (product-only mode) |

## Product Showcase Element Options

| Attribute | Default | Description |
|-----------|---------|-------------|
| \`data-key\` | script key | Override API key per element |
| \`data-view\` | \`grid\` | \`grid\`, \`slider\`, or \`featured\` |
| \`data-columns\` | \`3\` | Grid columns (desktop) |
| \`data-limit\` | \`12\` | Max products to load |
| \`data-title\` | \`Our Products\` | Section heading |
| \`data-subtitle\` | — | Subheading |
| \`data-cta\` | \`Buy Now\` | Button text |
| \`data-category\` | — | Filter by category |
| \`data-sort\` | \`newest\` | \`newest\`, \`name\`, \`price_asc\`, \`price_desc\` |
| \`data-loadmore\` | \`true\` | \`false\` to hide "Load More" |

## Subscription

Your available services are determined by your Awa Biz Suite subscription tier.
Upgrade at ${host}/pricing to unlock more.

## Links

- Awa Biz Suite: ${host}
- API Documentation: ${host}/docs/
- Support: ${host}/store/ (contact)
`;
}

function buildHtmlSnippet(embedKey: string, host: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Awa Biz Suite — Product Showcase Example</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f13; color: #f8fafc; }
    .page { max-width: 1200px; margin: 0 auto; padding: 60px 24px; }
    h1 { font-size: 48px; font-weight: 900; margin-bottom: 12px; }
    .subtitle { font-size: 18px; color: rgba(255,255,255,0.5); margin-bottom: 64px; }
  </style>
</head>
<body>
  <div class="page">
    <h1>Welcome to Our Platform</h1>
    <p class="subtitle">Browse our products and services below, powered by Awa Biz Suite.</p>

    <!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         PRODUCT SHOWCASE — Drop this div wherever you want products to appear.
         The script tag at the bottom of the page powers it automatically.
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
    <div
      data-awa="products"
      data-key="${embedKey}"
      data-view="featured"
      data-title="Our Products"
      data-subtitle="Everything we offer, updated in real time."
      data-columns="3"
      data-limit="9"
      data-cta="Buy Now"
      data-loadmore="true">
    </div>

  </div>

  <!--
    Awa Biz Suite Embed Script — place just before </body>
    Options:
      data-key        (required) Your embed API key
      data-hide-widget "true" to suppress the floating Services button
      data-theme      "dark" | "light"
      data-label      Floating button text
      data-position   "bottom-right" | "bottom-left"
  -->
  <script
    src="${host}/api/embed.js"
    data-key="${embedKey}"
    data-theme="dark"
    data-label="Services"
    data-position="bottom-right">
  </script>
</body>
</html>`;
}

function buildReactSnippet(embedKey: string, host: string) {
  return `/**
 * awa-integration/AwaWidget.jsx
 *
 * Drop-in React component that loads the Awa Biz Suite embed script once.
 * Renders the floating Services button + powers all [data-awa="products"] elements.
 *
 * Usage (App.jsx or root layout):
 *   import AwaWidget from './awa-integration/AwaWidget';
 *   <AwaWidget />
 */
import { useEffect } from 'react';

export default function AwaWidget({
  apiKey   = '${embedKey}',
  theme    = 'dark',
  label    = 'Services',
  position = 'bottom-right',
  host     = '${host}',
  hideWidget = false,
}) {
  useEffect(() => {
    if (document.getElementById('awa-embed-script')) return;
    const script = document.createElement('script');
    script.id = 'awa-embed-script';
    script.src = \`\${host}/api/embed.js\`;
    script.setAttribute('data-key',         apiKey);
    script.setAttribute('data-theme',       theme);
    script.setAttribute('data-label',       label);
    script.setAttribute('data-position',    position);
    script.setAttribute('data-host',        host);
    script.setAttribute('data-hide-widget', String(hideWidget));
    document.body.appendChild(script);
    return () => {
      ['awa-embed-script','awa-btn','awa-panel','awa-overlay'].forEach(id => {
        document.getElementById(id)?.remove();
      });
      document.querySelector('style[data-awa]')?.remove();
    };
  }, [apiKey, theme, label, position, host, hideWidget]);

  return null;
}`;
}

function buildReactNativeSnippet(embedKey: string, host: string) {
  return `import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet,
  Linking, ActivityIndicator, SafeAreaView, Pressable,
} from 'react-native';

const AWA_HOST = '${host}';
const AWA_KEY  = '${embedKey}';

/**
 * AwaWidget — React Native / Expo component.
 * Shows a floating "Services" button. On press, opens a bottom sheet
 * with the vendor's subscribed Awa Biz Suite services.
 *
 * Usage:
 *   import AwaWidget from './awa-integration/AwaWidget.native';
 *   // In your root layout (e.g. _layout.tsx or App.tsx):
 *   <AwaWidget />
 */
export default function AwaWidget({ label = 'Services', theme = 'dark' }) {
  const [open, setOpen] = useState(false);
  const [manifest, setManifest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isDark = theme !== 'light';
  const bg     = isDark ? '#0f0f13' : '#ffffff';
  const fg     = isDark ? '#f8fafc'  : '#0f172a';
  const muted  = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  useEffect(() => {
    if (open && !manifest && !loading) {
      setLoading(true);
      fetch(\`\${AWA_HOST}/api/embed/manifest?key=\${encodeURIComponent(AWA_KEY)}\`)
        .then(r => r.json())
        .then(data => { setManifest(data); setLoading(false); })
        .catch(e => { setError('Failed to load services.'); setLoading(false); });
    }
  }, [open]);

  const categories = {};
  if (manifest?.services) {
    manifest.services.forEach(s => {
      if (!categories[s.category]) categories[s.category] = [];
      categories[s.category].push(s);
    });
  }

  return (
    <>
      {/* Floating button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>⚡ {label}</Text>
      </TouchableOpacity>

      {/* Bottom sheet modal */}
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={[styles.sheet, { backgroundColor: bg }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
            <View style={styles.logoBox}>
              <Text style={styles.logoText}>{manifest?.vendor?.name?.charAt(0) ?? 'A'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.vendorName, { color: fg }]}>{manifest?.vendor?.name ?? 'Services'}</Text>
              <Text style={[styles.poweredBy, { color: muted }]}>Powered by Awa Biz Suite</Text>
            </View>
            <Pressable onPress={() => setOpen(false)} style={styles.closeBtn}>
              <Text style={{ color: muted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 24 }}>
            {loading && <ActivityIndicator style={{ marginTop: 40 }} color="#7c3aed" />}
            {error && <Text style={[styles.empty, { color: muted }]}>{error}</Text>}
            {!loading && !error && manifest?.services?.length === 0 && (
              <Text style={[styles.empty, { color: muted }]}>No services available on this plan.</Text>
            )}
            {!loading && !error && Object.entries(categories).map(([cat, svcs]) => (
              <View key={cat} style={{ marginBottom: 16 }}>
                <Text style={[styles.catLabel, { color: muted }]}>{cat.toUpperCase()}</Text>
                <View style={styles.grid}>
                  {(svcs as any[]).map(s => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.card, { backgroundColor: cardBg }]}
                      onPress={() => Linking.openURL(s.url)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.cardIcon}>{s.emoji}</Text>
                      <Text style={[styles.cardName, { color: fg }]}>{s.name}</Text>
                      <Text style={[styles.cardDesc, { color: muted }]}>{s.description}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
            <Text style={[styles.footerText, { color: muted }]}>Powered by Awa Biz Suite</Text>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab:        { position: 'absolute', bottom: 24, right: 20, zIndex: 999, backgroundColor: '#7c3aed', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 50, shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 12, elevation: 8 },
  fabText:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  sheet:      { flex: 1 },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1 },
  logoBox:    { width: 38, height: 38, borderRadius: 10, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' },
  logoText:   { color: '#fff', fontWeight: '900', fontSize: 17 },
  vendorName: { fontSize: 15, fontWeight: '700' },
  poweredBy:  { fontSize: 10, marginTop: 2 },
  closeBtn:   { padding: 8 },
  body:       { flex: 1, padding: 14 },
  catLabel:   { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  grid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card:       { width: '47%', padding: 13, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  cardIcon:   { fontSize: 22, marginBottom: 7 },
  cardName:   { fontSize: 12, fontWeight: '700', marginBottom: 3 },
  cardDesc:   { fontSize: 10, lineHeight: 14 },
  empty:      { textAlign: 'center', marginTop: 40, fontSize: 13 },
  footer:     { padding: 12, borderTopWidth: 1, alignItems: 'center' },
  footerText: { fontSize: 10 },
});`;
}

// ─── React Product Components ─────────────────────────────────────────────────

function buildAwaProductsJsx(embedKey: string, host: string) {
  return `/**
 * AwaProducts.jsx — React component that fetches and renders your live
 * Awa Biz Suite product catalog with grid, carousel, or featured layout.
 *
 * Usage:
 *   import { AwaProducts } from './awa-integration/products/AwaProducts';
 *
 *   // Responsive 3-column grid
 *   <AwaProducts apiKey="${embedKey}" view="grid" columns={3} />
 *
 *   // Auto-advancing carousel
 *   <AwaProducts apiKey="${embedKey}" view="slider" title="Featured Products" />
 *
 *   // Hero card + compact grid
 *   <AwaProducts apiKey="${embedKey}" view="featured" title="Our Products" />
 */
import { useState, useEffect, useRef } from 'react';

const AWA_HOST = '${host}';

// ── Data fetching ────────────────────────────────────────────────────────────

async function fetchProducts(apiKey, { limit = 12, page = 1, sort = 'newest', category = '' } = {}) {
  const url = new URL(AWA_HOST + '/api/embed/products');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('page', String(page));
  url.searchParams.set('sort', sort);
  if (category) url.searchParams.set('category', category);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch products (' + res.status + ')');
  return res.json();
}

function formatPrice(price, currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(price);
  } catch {
    return currency + ' ' + price.toFixed(2);
  }
}

// ── Skeleton loader ──────────────────────────────────────────────────────────

function ProductSkeleton({ columns = 3, isDark = true }) {
  const bg    = isDark ? '#1a1a24' : '#f0f0f0';
  const pulse = isDark ? '#2a2a38' : '#e0e0e0';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + columns + ', 1fr)', gap: 20 }}>
      {Array.from({ length: columns * 2 }).map((_, i) => (
        <div key={i} style={{ borderRadius: 18, overflow: 'hidden', background: bg }}>
          <div style={{ aspectRatio: '1', background: pulse, animation: 'awaPulse 1.5s ease-in-out infinite', animationDelay: i * 0.1 + 's' }} />
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ height: 12, borderRadius: 6, background: pulse, width: '80%' }} />
            <div style={{ height: 22, borderRadius: 6, background: pulse, width: '50%' }} />
            <div style={{ height: 12, borderRadius: 6, background: pulse }} />
            <div style={{ height: 42, borderRadius: 12, background: pulse, marginTop: 4 }} />
          </div>
        </div>
      ))}
      <style>{\`@keyframes awaPulse { 0%,100%{opacity:1} 50%{opacity:.5} }\`}</style>
    </div>
  );
}

// ── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ product, cta = 'Buy Now', isDark = true, style = {} }) {
  const [hovered, setHovered] = useState(false);
  const bg     = isDark ? '#1a1a24' : '#ffffff';
  const fg     = isDark ? '#f8fafc' : '#0f172a';
  const muted  = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 18, overflow: 'hidden', background: bg,
        border: '1px solid ' + (hovered ? 'rgba(124,58,237,.4)' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)')),
        transform: hovered ? 'translateY(-8px)' : 'none',
        boxShadow: hovered ? '0 28px 56px rgba(0,0,0,' + (isDark ? '.45' : '.15') + ')' : 'none',
        transition: 'all .25s cubic-bezier(.4,0,.2,1)',
        ...style,
      }}
    >
      {/* Image */}
      <div style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden' }}>
        {product.imageUrl
          ? <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: hovered ? 'scale(1.06)' : 'none', transition: 'transform .4s ease' }} loading="lazy" />
          : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,rgba(124,58,237,.15),rgba(79,70,229,.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52 }}>🛍️</div>
        }
        <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 20, backdropFilter: 'blur(8px)', background: product.inStock ? 'rgba(16,185,129,.18)' : 'rgba(239,68,68,.18)', color: product.inStock ? '#10b981' : '#ef4444', border: '1px solid ' + (product.inStock ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)') }}>
          {product.inStock ? '● In Stock' : '✕ Sold Out'}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: 16 }}>
        {product.category && <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7c3aed', margin: '0 0 6px' }}>{product.category}</p>}
        <p style={{ fontSize: 15, fontWeight: 800, margin: '0 0 6px', color: fg, lineHeight: 1.3 }}>{product.name}</p>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#7c3aed', margin: '0 0 8px' }}>
          {formatPrice(product.price, product.currency)}
          {product.unit && <span style={{ fontSize: 11, color: muted, fontWeight: 500 }}> / {product.unit}</span>}
        </p>
        {product.description && <p style={{ fontSize: 12, color: muted, margin: '0 0 14px', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{product.description}</p>}
        {product.inStock
          ? <a href={product.buyUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '100%', padding: 11, borderRadius: 12, background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', fontWeight: 800, fontSize: 13, textAlign: 'center', textDecoration: 'none', border: 'none', cursor: 'pointer' }}>{cta}</a>
          : <span style={{ display: 'block', width: '100%', padding: 11, borderRadius: 12, background: isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)', color: muted, fontWeight: 800, fontSize: 13, textAlign: 'center' }}>Sold Out</span>
        }
      </div>
    </div>
  );
}

// ── Grid layout ──────────────────────────────────────────────────────────────

function ProductGrid({ products, columns, cta, title, subtitle, isDark, showLoadMore, onLoadMore, loadingMore }) {
  const fg    = isDark ? '#f8fafc' : '#0f172a';
  const muted = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';

  return (
    <div>
      {title && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
          <div>
            <p style={{ fontSize: 24, fontWeight: 900, margin: 0, color: fg }}>{title}</p>
            {subtitle && <p style={{ fontSize: 13, color: muted, margin: '4px 0 0' }}>{subtitle}</p>}
          </div>
          <span style={{ fontSize: 12, color: muted, background: isDark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)', padding: '4px 10px', borderRadius: 20, border: '1px solid ' + (isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'), whiteSpace: 'nowrap' }}>{products.length} products</span>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + columns + ', 1fr)', gap: 20 }}>
        {products.map((p, i) => <ProductCard key={p.id} product={p} cta={cta} isDark={isDark} style={{ animation: 'awaFadeUp .45s ease ' + (i * 0.07) + 's both' }} />)}
      </div>
      {showLoadMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
          <button onClick={onLoadMore} disabled={loadingMore} style={{ padding: '12px 32px', borderRadius: 50, border: '2px solid ' + (isDark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.12)'), color: isDark ? '#f8fafc' : '#0f172a', background: 'none', fontSize: 13, fontWeight: 700, cursor: loadingMore ? 'wait' : 'pointer' }}>
            {loadingMore ? 'Loading…' : 'Load More →'}
          </button>
        </div>
      )}
      <style>{\`@keyframes awaFadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}\`}</style>
    </div>
  );
}

// ── Featured layout ───────────────────────────────────────────────────────────

function ProductFeatured({ products, columns, cta, title, subtitle, isDark, showLoadMore, onLoadMore, loadingMore }) {
  if (!products.length) return null;
  const hero = products[0];
  const rest = products.slice(1);
  const fg    = isDark ? '#f8fafc' : '#0f172a';
  const muted = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
  const heroBg = isDark ? '#1a1a24' : '#f8f8ff';
  const heroBorder = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';

  return (
    <div>
      {title && <p style={{ fontSize: 24, fontWeight: 900, margin: '0 0 24px', color: fg }}>{title}</p>}
      {/* Hero */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderRadius: 24, overflow: 'hidden', background: heroBg, border: '1px solid ' + heroBorder, marginBottom: 20 }}>
        <div style={{ overflow: 'hidden' }}>
          {hero.imageUrl
            ? <img src={hero.imageUrl} alt={hero.name} style={{ width: '100%', height: '100%', minHeight: 300, objectFit: 'cover', display: 'block' }} loading="lazy" />
            : <div style={{ width: '100%', minHeight: 300, background: 'linear-gradient(135deg,rgba(124,58,237,.15),rgba(79,70,229,.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 90 }}>🛍️</div>
          }
        </div>
        <div style={{ padding: '40px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
          {hero.category && <span style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: 800, padding: '5px 12px', borderRadius: 20, background: 'linear-gradient(135deg,rgba(124,58,237,.2),rgba(79,70,229,.2))', color: '#7c3aed', border: '1px solid rgba(124,58,237,.25)' }}>{hero.category}</span>}
          <p style={{ fontSize: 32, fontWeight: 900, color: fg, lineHeight: 1.15, margin: 0 }}>{hero.name}</p>
          <p style={{ fontSize: 36, fontWeight: 900, color: '#7c3aed', margin: 0 }}>{formatPrice(hero.price, hero.currency)}</p>
          {hero.description && <p style={{ fontSize: 14, color: muted, lineHeight: 1.65, margin: 0 }}>{hero.description}</p>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {hero.inStock
              ? <a href={hero.buyUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '14px 28px', borderRadius: 12, background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>{cta}</a>
              : <span style={{ padding: '14px 28px', borderRadius: 12, background: isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)', color: muted, fontWeight: 800, fontSize: 14 }}>Sold Out</span>
            }
          </div>
        </div>
      </div>
      {/* Rest as grid */}
      {rest.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + Math.min(columns, 3) + ', 1fr)', gap: 20 }}>
          {rest.map((p, i) => <ProductCard key={p.id} product={p} cta={cta} isDark={isDark} style={{ animation: 'awaFadeUp .45s ease ' + (i * 0.07) + 's both' }} />)}
        </div>
      )}
      <style>{\`@keyframes awaFadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}\`}</style>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function AwaProducts({
  apiKey = '${embedKey}',
  view = 'grid',
  columns = 3,
  limit = 12,
  title = 'Our Products',
  subtitle,
  cta = 'Buy Now',
  category,
  sort = 'newest',
  theme = 'dark',
  showLoadMore = true,
  host = AWA_HOST,
}) {
  const [products, setProducts]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const isDark = theme !== 'light';

  useEffect(() => {
    setLoading(true); setError(null);
    fetchProducts(apiKey, { limit, page: 1, sort, category })
      .then(data => {
        setProducts(data.products || []);
        setHasMore(1 < (data.pages || 1));
        setPage(1);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiKey, limit, sort, category]);

  async function handleLoadMore() {
    setLoadingMore(true);
    const next = page + 1;
    fetchProducts(apiKey, { limit, page: next, sort, category })
      .then(data => {
        setProducts(prev => [...prev, ...(data.products || [])]);
        setHasMore(next < (data.pages || 1));
        setPage(next);
      })
      .finally(() => setLoadingMore(false));
  }

  const fg = isDark ? '#f8fafc' : '#0f172a';

  if (loading) return <ProductSkeleton columns={columns} isDark={isDark} />;
  if (error)   return <p style={{ color: '#ef4444', fontSize: 13 }}>⚠️ {error}</p>;
  if (!products.length) return <p style={{ color: isDark ? 'rgba(255,255,255,.4)' : 'rgba(0,0,0,.4)', fontSize: 13 }}>No products available yet.</p>;

  const commonProps = { products, cta, title, subtitle, isDark, showLoadMore: showLoadMore && hasMore, onLoadMore: handleLoadMore, loadingMore };

  if (view === 'slider')   return <AwaProductSlider products={products} cta={cta} title={title} isDark={isDark} />;
  if (view === 'featured') return <ProductFeatured {...commonProps} columns={columns} />;
  return <ProductGrid {...commonProps} columns={columns} />;
}

export default AwaProducts;

// AwaProductSlider is in AwaProductSlider.jsx
// AwaProductList (React Native) is in AwaProductList.native.jsx
`;
}

function buildAwaProductSliderJsx(embedKey: string, host: string) {
  return `/**
 * AwaProductSlider.jsx — Auto-advancing product carousel.
 *
 * Usage:
 *   import { AwaProductSlider } from './awa-integration/products/AwaProductSlider';
 *   <AwaProductSlider apiKey="${embedKey}" />
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const AWA_HOST = '${host}';

function formatPrice(price, currency = 'USD') {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(price); }
  catch { return currency + ' ' + price.toFixed(2); }
}

export function AwaProductSlider({
  apiKey = '${embedKey}',
  title,
  limit = 8,
  cta = 'Buy Now',
  theme = 'dark',
  autoInterval = 4000,
}) {
  const [products, setProducts] = useState([]);
  const [cur, setCur]           = useState(0);
  const [loading, setLoading]   = useState(true);
  const timerRef                = useRef(null);

  const isDark   = theme !== 'light';
  const bg       = isDark ? '#1a1a24' : '#f8f8ff';
  const fg       = isDark ? '#f8fafc' : '#0f172a';
  const muted    = isDark ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.45)';
  const borderC  = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
  const arrowBg  = isDark ? 'rgba(15,15,19,.7)' : 'rgba(255,255,255,.9)';

  useEffect(() => {
    fetch(AWA_HOST + '/api/embed/products?key=' + encodeURIComponent(apiKey) + '&limit=' + limit)
      .then(r => r.json())
      .then(d => setProducts(d.products || []))
      .finally(() => setLoading(false));
  }, [apiKey, limit]);

  const goTo = useCallback((i) => setCur((i + products.length) % products.length), [products.length]);

  useEffect(() => {
    if (!products.length) return;
    timerRef.current = setInterval(() => goTo(cur + 1), autoInterval);
    return () => clearInterval(timerRef.current);
  }, [cur, products.length, autoInterval]);

  function pause() { clearInterval(timerRef.current); }

  if (loading) return <div style={{ height: 380, borderRadius: 24, background: isDark ? '#1a1a24' : '#f0f0f0', animation: 'awaPulse 1.5s ease-in-out infinite' }}><style>{\`@keyframes awaPulse{0%,100%{opacity:1}50%{opacity:.5}}\`}</style></div>;
  if (!products.length) return null;

  const p = products[cur];

  return (
    <div>
      {title && <p style={{ fontSize: 24, fontWeight: 900, margin: '0 0 20px', color: fg }}>{title}</p>}
      <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', background: bg, border: '1px solid ' + borderC }}>
        {/* Slide */}
        <div key={cur} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', animation: 'awaSlideIn .45s ease' }}>
          <div style={{ overflow: 'hidden' }}>
            {p.imageUrl
              ? <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', minHeight: 320, objectFit: 'cover', display: 'block' }} loading="lazy" />
              : <div style={{ width: '100%', minHeight: 320, background: 'linear-gradient(135deg,rgba(124,58,237,.15),rgba(79,70,229,.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80 }}>🛍️</div>
            }
          </div>
          <div style={{ padding: '40px 36px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
            {p.category && <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#7c3aed', margin: 0 }}>{p.category}</p>}
            <p style={{ fontSize: 28, fontWeight: 900, color: fg, lineHeight: 1.2, margin: 0 }}>{p.name}</p>
            <p style={{ fontSize: 32, fontWeight: 900, color: '#7c3aed', margin: 0 }}>{formatPrice(p.price, p.currency)}</p>
            {p.description && <p style={{ fontSize: 13, color: muted, lineHeight: 1.6, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{p.description}</p>}
            {p.inStock
              ? <a href={p.buyUrl} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'flex-start', padding: '12px 28px', borderRadius: 12, background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', fontWeight: 800, fontSize: 14, textDecoration: 'none', marginTop: 4 }}>{cta}</a>
              : <span style={{ alignSelf: 'flex-start', padding: '12px 28px', borderRadius: 12, background: isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)', color: muted, fontWeight: 800, fontSize: 14 }}>Sold Out</span>
            }
          </div>
        </div>

        {/* Arrows */}
        {['prev','next'].map(dir => (
          <button key={dir} onMouseEnter={pause} onClick={() => { pause(); goTo(dir === 'prev' ? cur - 1 : cur + 1); }}
            style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', [dir === 'prev' ? 'left' : 'right']: 12, width: 40, height: 40, borderRadius: '50%', background: arrowBg, backdropFilter: 'blur(8px)', border: '1px solid ' + borderC, color: fg, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}>
            {dir === 'prev' ? '←' : '→'}
          </button>
        ))}
      </div>

      {/* Dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14, alignItems: 'center' }}>
        {products.map((_, i) => (
          <button key={i} onClick={() => { pause(); goTo(i); }} style={{ width: i === cur ? 22 : 7, height: 7, borderRadius: i === cur ? 4 : '50%', background: i === cur ? '#7c3aed' : (isDark ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.2)'), border: 'none', cursor: 'pointer', padding: 0, transition: 'all .35s cubic-bezier(.4,0,.2,1)' }} />
        ))}
      </div>

      <style>{\`@keyframes awaSlideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}\`}</style>
    </div>
  );
}

export default AwaProductSlider;
`;
}

function buildAwaProductListNative(embedKey: string, host: string) {
  return `/**
 * AwaProductList.native.jsx — React Native / Expo product list component.
 * Fetches your live Awa Biz Suite product catalog and renders a scrollable,
 * tappable product list with images, prices, and a Buy button.
 *
 * Usage (Expo / React Native):
 *   import { AwaProductList } from './awa-integration/products/AwaProductList.native';
 *
 *   // In your screen:
 *   <AwaProductList apiKey="${embedKey}" />
 *
 *   // Horizontal carousel:
 *   <AwaProductList apiKey="${embedKey}" horizontal />
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, FlatList, ScrollView,
  StyleSheet, Linking, ActivityIndicator, Dimensions,
} from 'react-native';

const AWA_HOST  = '${host}';
const { width } = Dimensions.get('window');

function formatPrice(price, currency = 'USD') {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(price); }
  catch { return currency + ' ' + price.toFixed(2); }
}

function ProductCardH({ product, cta, isDark }) {
  const bg    = isDark ? '#1a1a24' : '#ffffff';
  const fg    = isDark ? '#f8fafc' : '#0f172a';
  const muted = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';

  return (
    <TouchableOpacity
      style={[styles.card, { background: bg, backgroundColor: bg, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', width: width * 0.65, marginRight: 12 }]}
      onPress={() => product.inStock && Linking.openURL(product.buyUrl)}
      activeOpacity={0.8}
    >
      {product.imageUrl
        ? <Image source={{ uri: product.imageUrl }} style={styles.cardImg} />
        : <View style={[styles.cardImgPh, { backgroundColor: 'rgba(124,58,237,0.1)' }]}><Text style={styles.cardImgEmoji}>🛍️</Text></View>
      }
      <View style={[styles.badge, { backgroundColor: product.inStock ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)' }]}>
        <Text style={[styles.badgeText, { color: product.inStock ? '#10b981' : '#ef4444' }]}>{product.inStock ? '● In Stock' : '✕ Sold Out'}</Text>
      </View>
      <View style={styles.cardBody}>
        {product.category && <Text style={styles.catLabel}>{product.category}</Text>}
        <Text style={[styles.cardName, { color: fg }]} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.cardPrice}>{formatPrice(product.price, product.currency)}{product.unit ? ' / ' + product.unit : ''}</Text>
        <TouchableOpacity
          style={[styles.cardBtn, !product.inStock && styles.cardBtnDisabled]}
          onPress={() => product.inStock && Linking.openURL(product.buyUrl)}
          disabled={!product.inStock}
        >
          <Text style={[styles.cardBtnText, !product.inStock && { color: muted }]}>{product.inStock ? cta : 'Sold Out'}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function ProductCardV({ product, cta, isDark }) {
  const bg    = isDark ? '#1a1a24' : '#ffffff';
  const fg    = isDark ? '#f8fafc' : '#0f172a';
  const muted = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
  const cardW = (width - 48) / 2;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: bg, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', width: cardW, marginBottom: 14 }]}
      onPress={() => product.inStock && Linking.openURL(product.buyUrl)}
      activeOpacity={0.8}
    >
      {product.imageUrl
        ? <Image source={{ uri: product.imageUrl }} style={styles.cardImg} />
        : <View style={[styles.cardImgPh, { backgroundColor: 'rgba(124,58,237,0.1)' }]}><Text style={styles.cardImgEmoji}>🛍️</Text></View>
      }
      <View style={[styles.badge, { backgroundColor: product.inStock ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)' }]}>
        <Text style={[styles.badgeText, { color: product.inStock ? '#10b981' : '#ef4444' }]}>{product.inStock ? '● In Stock' : '✕ Sold Out'}</Text>
      </View>
      <View style={styles.cardBody}>
        {product.category && <Text style={styles.catLabel}>{product.category.toUpperCase()}</Text>}
        <Text style={[styles.cardName, { color: fg }]} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.cardPrice}>{formatPrice(product.price, product.currency)}</Text>
        <TouchableOpacity style={[styles.cardBtn, !product.inStock && styles.cardBtnDisabled]} onPress={() => product.inStock && Linking.openURL(product.buyUrl)} disabled={!product.inStock}>
          <Text style={styles.cardBtnText}>{product.inStock ? cta : 'Sold Out'}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export function AwaProductList({
  apiKey = '${embedKey}',
  host = AWA_HOST,
  limit = 12,
  title = 'Our Products',
  cta = 'Buy Now',
  horizontal = false,
  theme = 'dark',
  category,
  sort = 'newest',
}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [hasMore, setHasMore]   = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const isDark = theme !== 'light';
  const fg     = isDark ? '#f8fafc' : '#0f172a';
  const muted  = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';

  const fetchPage = useCallback(async (p) => {
    const url = host + '/api/embed/products?key=' + encodeURIComponent(apiKey) + '&limit=' + limit + '&page=' + p + '&sort=' + sort + (category ? '&category=' + encodeURIComponent(category) : '');
    const res = await fetch(url);
    return res.json();
  }, [apiKey, host, limit, sort, category]);

  useEffect(() => {
    setLoading(true);
    fetchPage(1).then(d => {
      setProducts(d.products || []);
      setHasMore(1 < (d.pages || 1));
      setPage(1);
    }).finally(() => setLoading(false));
  }, [fetchPage]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = page + 1;
    fetchPage(next).then(d => {
      setProducts(prev => [...prev, ...(d.products || [])]);
      setHasMore(next < (d.pages || 1));
      setPage(next);
    }).finally(() => setLoadingMore(false));
  }

  if (loading) return (
    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
      <ActivityIndicator size="large" color="#7c3aed" />
    </View>
  );

  if (!products.length) return (
    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
      <Text style={{ color: muted, fontSize: 14 }}>No products available yet.</Text>
    </View>
  );

  if (horizontal) {
    return (
      <View>
        {title && <Text style={[styles.sectionTitle, { color: fg }]}>{title}</Text>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {products.map(p => <ProductCardH key={p.id} product={p} cta={cta} isDark={isDark} />)}
        </ScrollView>
        <View style={styles.poweredBy}>
          <Text style={[styles.poweredByText, { color: muted }]}>Powered by Awa Biz Suite</Text>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      data={products}
      keyExtractor={p => String(p.id)}
      numColumns={2}
      columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 16 }}
      ListHeaderComponent={title ? <Text style={[styles.sectionTitle, { color: fg, paddingHorizontal: 16 }]}>{title}</Text> : null}
      ListFooterComponent={
        <View>
          {hasMore && (
            <TouchableOpacity onPress={loadMore} disabled={loadingMore} style={styles.loadMoreBtn}>
              {loadingMore ? <ActivityIndicator size="small" color="#7c3aed" /> : <Text style={styles.loadMoreText}>Load More →</Text>}
            </TouchableOpacity>
          )}
          <View style={styles.poweredBy}>
            <Text style={[styles.poweredByText, { color: muted }]}>Powered by Awa Biz Suite</Text>
          </View>
        </View>
      }
      renderItem={({ item }) => <ProductCardV product={item} cta={cta} isDark={isDark} />}
    />
  );
}

export default AwaProductList;

const styles = StyleSheet.create({
  card:         { borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  cardImg:      { width: '100%', aspectRatio: 1, resizeMode: 'cover' },
  cardImgPh:    { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cardImgEmoji: { fontSize: 40 },
  badge:        { position: 'absolute', top: 8, left: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText:    { fontSize: 9, fontWeight: '700' },
  cardBody:     { padding: 12, gap: 4 },
  catLabel:     { fontSize: 9, fontWeight: '700', color: '#7c3aed', letterSpacing: 0.8, marginBottom: 2 },
  cardName:     { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  cardPrice:    { fontSize: 17, fontWeight: '900', color: '#7c3aed', marginTop: 2 },
  cardBtn:      { marginTop: 10, paddingVertical: 10, borderRadius: 10, backgroundColor: '#7c3aed', alignItems: 'center' },
  cardBtnDisabled: { backgroundColor: 'rgba(124,58,237,0.2)' },
  cardBtnText:  { color: '#fff', fontWeight: '800', fontSize: 12 },
  sectionTitle: { fontSize: 22, fontWeight: '900', marginBottom: 16, marginTop: 4 },
  loadMoreBtn:  { margin: 20, padding: 14, borderRadius: 50, borderWidth: 2, borderColor: 'rgba(124,58,237,.3)', alignItems: 'center' },
  loadMoreText: { color: '#7c3aed', fontWeight: '700', fontSize: 13 },
  poweredBy:    { alignItems: 'center', paddingVertical: 12 },
  poweredByText:{ fontSize: 10 },
});
`;
}
