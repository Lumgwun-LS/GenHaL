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

  const readme = buildReadme(profile.name, embedKey, host);
  const htmlSnippet = buildHtmlSnippet(embedKey, host);
  const reactSnippet = buildReactSnippet(embedKey, host);
  const reactNativeSnippet = buildReactNativeSnippet(embedKey, host);

  try {
    let prUrl: string;
    if (provider === "github") {
      prUrl = await pushToGitHub({ token, owner, repo, baseBranch, newBranch, readme, htmlSnippet, reactSnippet, reactNativeSnippet });
    } else if (provider === "gitlab") {
      prUrl = await pushToGitLab({ token, owner, repo, baseBranch, newBranch, readme, htmlSnippet, reactSnippet, reactNativeSnippet });
    } else {
      prUrl = await pushToBitbucket({ token, owner, repo, baseBranch, newBranch, readme, htmlSnippet, reactSnippet, reactNativeSnippet });
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

async function pushToGitHub(p: {
  token: string; owner: string; repo: string; baseBranch: string; newBranch: string;
  readme: string; htmlSnippet: string; reactSnippet: string; reactNativeSnippet: string;
}) {
  const base = `https://api.github.com/repos/${p.owner}/${p.repo}`;
  const headers = { Authorization: `Bearer ${p.token}`, "Content-Type": "application/json", Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };

  // Get base branch SHA
  const refData = await gitFetch(`${base}/git/refs/heads/${p.baseBranch}`, { headers });
  const sha = (refData.object as Record<string, unknown>)?.sha as string;

  // Create integration branch (ignore 422 = already exists)
  try {
    await gitFetch(`${base}/git/refs`, { method: "POST", headers, body: JSON.stringify({ ref: `refs/heads/${p.newBranch}`, sha }) });
  } catch (e: unknown) {
    if (!(e instanceof Error) || !e.message.includes("422")) throw e;
  }

  const files = [
    { path: "awa-integration/README.md", content: p.readme },
    { path: "awa-integration/embed.html", content: p.htmlSnippet },
    { path: "awa-integration/AwaWidget.jsx", content: p.reactSnippet },
    { path: "awa-integration/AwaWidget.native.jsx", content: p.reactNativeSnippet },
  ];

  for (const f of files) {
    // Get existing file SHA if any (to update rather than create)
    let existingSha: string | undefined;
    try {
      const existing = await gitFetch(`${base}/contents/${f.path}?ref=${p.newBranch}`, { headers });
      existingSha = existing.sha as string | undefined;
    } catch { /* file doesn't exist yet */ }

    await gitFetch(`${base}/contents/${f.path}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `feat: add Awa Biz Suite embedded services integration`,
        content: btoa(unescape(encodeURIComponent(f.content))),
        branch: p.newBranch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    });
  }

  // Create PR
  const pr = await gitFetch(`${base}/pulls`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "feat: Awa Biz Suite embedded services integration",
      body: `This PR adds the Awa Biz Suite embedded services widget to your platform.\n\n**What's included:**\n- \`awa-integration/README.md\` — setup guide\n- \`awa-integration/embed.html\` — drop-in HTML snippet\n- \`awa-integration/AwaWidget.jsx\` — React component\n- \`awa-integration/AwaWidget.native.jsx\` — React Native component\n\nGenerated by [Awa Biz Suite Connected Business](https://awajimaaai.com).`,
      head: p.newBranch,
      base: p.baseBranch,
    }),
  });
  return pr.html_url as string;
}

async function pushToGitLab(p: {
  token: string; owner: string; repo: string; baseBranch: string; newBranch: string;
  readme: string; htmlSnippet: string; reactSnippet: string; reactNativeSnippet: string;
}) {
  const projectId = encodeURIComponent(`${p.owner}/${p.repo}`);
  const base = `https://gitlab.com/api/v4/projects/${projectId}`;
  const headers = { "PRIVATE-TOKEN": p.token, "Content-Type": "application/json" };

  // Create branch
  try {
    await gitFetch(`${base}/repository/branches`, {
      method: "POST", headers,
      body: JSON.stringify({ branch: p.newBranch, ref: p.baseBranch }),
    });
  } catch (e: unknown) {
    if (!(e instanceof Error) || !e.message.includes("400")) throw e;
  }

  const files = [
    { path: "awa-integration/README.md", content: p.readme },
    { path: "awa-integration/embed.html", content: p.htmlSnippet },
    { path: "awa-integration/AwaWidget.jsx", content: p.reactSnippet },
    { path: "awa-integration/AwaWidget.native.jsx", content: p.reactNativeSnippet },
  ];

  for (const f of files) {
    const encodedPath = encodeURIComponent(f.path);
    const payload = { branch: p.newBranch, content: f.content, commit_message: "feat: add Awa Biz Suite embedded services integration" };
    // Try create, fall back to update
    try {
      await gitFetch(`${base}/repository/files/${encodedPath}`, { method: "POST", headers, body: JSON.stringify(payload) });
    } catch {
      await gitFetch(`${base}/repository/files/${encodedPath}`, { method: "PUT", headers, body: JSON.stringify(payload) });
    }
  }

  const mr = await gitFetch(`${base}/merge_requests`, {
    method: "POST", headers,
    body: JSON.stringify({ title: "feat: Awa Biz Suite embedded services integration", source_branch: p.newBranch, target_branch: p.baseBranch, description: "Adds the Awa Biz Suite embedded services widget. See awa-integration/README.md for setup." }),
  });
  return mr.web_url as string;
}

async function pushToBitbucket(p: {
  token: string; owner: string; repo: string; baseBranch: string; newBranch: string;
  readme: string; htmlSnippet: string; reactSnippet: string; reactNativeSnippet: string;
}) {
  const base = `https://api.bitbucket.org/2.0/repositories/${p.owner}/${p.repo}`;
  const headers = { Authorization: `Bearer ${p.token}`, "Content-Type": "application/x-www-form-urlencoded" };

  // Create branch via src endpoint (Bitbucket uses multipart for file creation)
  const form = new URLSearchParams();
  form.append("awa-integration/README.md", p.readme);
  form.append("awa-integration/embed.html", p.htmlSnippet);
  form.append("awa-integration/AwaWidget.jsx", p.reactSnippet);
  form.append("awa-integration/AwaWidget.native.jsx", p.reactNativeSnippet);
  form.append("branch", p.newBranch);
  form.append("message", "feat: add Awa Biz Suite embedded services integration");
  await gitFetch(`${base}/src`, { method: "POST", headers, body: form.toString() });

  const pr = await gitFetch(`${base}/pullrequests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "feat: Awa Biz Suite embedded services integration",
      source: { branch: { name: p.newBranch } },
      destination: { branch: { name: p.baseBranch } },
      description: "Adds the Awa Biz Suite embedded widget. See awa-integration/README.md.",
    }),
  });
  return (pr.links as Record<string, unknown> & { html: { href: string } }).html.href;
}

// ── Integration file content ───────────────────────────────────────────────────

function buildReadme(platformName: string, embedKey: string, host: string) {
  return `# Awa Biz Suite — Connected Business Integration

This directory contains the code snippets for embedding **Awa Biz Suite** services into **${platformName}**.

## What this does

Awa Biz Suite is a business operations platform. As a Connected Business you can embed a floating
"Services" button on your website or mobile app that gives your users access to your subscribed Awa
services — **without them needing an Awa account**.

## Your API Key

\`\`\`
${embedKey}
\`\`\`

> **Keep this secret in server-side environments.** For the frontend widget the key is visible in
> the script tag — use a restricted "embed" scope key (like this one) rather than your master key.

## Quick Start

### HTML / Static website

See \`embed.html\` for a ready-to-paste snippet.

### React

See \`AwaWidget.jsx\` for a React component you can drop into any page.

### React Native / Expo

See \`AwaWidget.native.jsx\` for a React Native integration.

## Subscription

Your embedded services are determined by your Awa Biz Suite subscription tier.
Upgrade at ${host}/pricing to unlock more services.

## Documentation

${host}/docs/
`;
}

function buildHtmlSnippet(embedKey: string, host: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Awa Biz Suite Embedded Widget — Example</title>
</head>
<body>
  <h1>My Platform</h1>
  <p>Your existing website content goes here.</p>

  <!-- Awa Biz Suite Embedded Services Widget -->
  <!-- Place this script tag just before </body> -->
  <script
    src="${host}/api/embed.js"
    data-key="${embedKey}"
    data-theme="dark"
    data-label="Services"
    data-position="bottom-right">
  </script>

  <!--
    Configuration attributes:
      data-key       (required) Your Connected Business API key
      data-theme     "dark" | "light"  (default: dark)
      data-label     Text on the floating button  (default: "Services")
      data-position  "bottom-right" | "bottom-left"  (default: bottom-right)
      data-host      Override the Awa host  (default: auto-detected from script src)
  -->
</body>
</html>`;
}

function buildReactSnippet(embedKey: string, host: string) {
  return `import { useEffect } from 'react';

/**
 * AwaWidget — drops the Awa Biz Suite embedded services widget into any React app.
 *
 * Usage:
 *   import AwaWidget from './awa-integration/AwaWidget';
 *   // In your App.jsx or any layout component:
 *   <AwaWidget />
 */
export default function AwaWidget({
  apiKey = '${embedKey}',
  theme = 'dark',
  label = 'Services',
  position = 'bottom-right',
  host = '${host}',
}) {
  useEffect(() => {
    if (document.getElementById('awa-embed-script')) return;
    const script = document.createElement('script');
    script.id = 'awa-embed-script';
    script.src = \`\${host}/api/embed.js\`;
    script.setAttribute('data-key', apiKey);
    script.setAttribute('data-theme', theme);
    script.setAttribute('data-label', label);
    script.setAttribute('data-position', position);
    script.setAttribute('data-host', host);
    document.body.appendChild(script);
    return () => {
      document.getElementById('awa-embed-script')?.remove();
      document.getElementById('awa-btn')?.remove();
      document.getElementById('awa-panel')?.remove();
      document.getElementById('awa-overlay')?.remove();
    };
  }, [apiKey, theme, label, position, host]);

  return null; // renders nothing — the widget is injected into <body>
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
