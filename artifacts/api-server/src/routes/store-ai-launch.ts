/**
 * AI App Launcher — lets a developer upload assets (ZIP bundle or individual
 * images) directly to object storage via presigned URLs, then POST just the
 * resulting file URLs here for AI analysis and auto-listing generation.
 *
 * Endpoints (all under /store/ai-launch, mounted before requireAuth block):
 *   POST   /upload          — JSON: { bundleUrl?, iconUrl?, screenshotUrls?, manifest? }
 *   GET    /:sessionId      — poll session status + generated data
 *   POST   /:sessionId/submit — create app from reviewed AI data
 *   DELETE /:sessionId      — discard session
 */

import { Router } from "express";
import AdmZip from "adm-zip";
import { db } from "@workspace/db";
import {
  storeAiLaunchSessionsTable,
  storeAppsTable,
  storeDeveloperAccountsTable,
  type AiLaunchExtractedFiles,
  type AiLaunchGeneratedData,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, getAuth } from "@clerk/express";
import { logger } from "../lib/logger";
import { storeGeneratedMedia } from "../lib/generated-media-storage";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AFRICA_CATEGORIES = [
  "Mobile Money & Fintech","Agriculture & Farming","Health & Telemedicine",
  "Education & E-Learning","Logistics & Delivery","Food & Restaurant",
  "Entertainment & Music","Social & Community","Business & Commerce",
  "Government & E-Services","Transport & Ride-Hailing","Utilities & Infrastructure",
  "Fashion & Beauty","Real Estate",
];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

async function requireDeveloper(req: any, res: any) {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const dev = await db.query.storeDeveloperAccountsTable.findFirst({
    where: eq(storeDeveloperAccountsTable.clerkUserId, userId),
  });
  if (!dev) { res.status(404).json({ error: "Developer account not found." }); return null; }
  if (dev.status !== "active") { res.status(403).json({ error: "Account suspended." }); return null; }
  return dev;
}

/** Classify a file by extension to decide if it's an image we should upload. */
function isImageFile(name: string): boolean {
  return /\.(png|jpg|jpeg|webp|gif)$/i.test(name);
}

function isManifestFile(name: string): boolean {
  return /^app\.(json|yaml|yml)$/i.test(name.split("/").pop() ?? "");
}

/**
 * Upload a raw image buffer to object storage and return its public URL.
 * Falls back to null on any error so a single bad file can't abort the run.
 */
async function uploadImageToStorage(buf: Buffer, contentType: string): Promise<string | null> {
  try {
    const { publicUrl } = await storeGeneratedMedia(buf, contentType);
    return publicUrl;
  } catch (err) {
    logger.warn({ err }, "ai-launch: failed to upload image to storage");
    return null;
  }
}

/**
 * Run GPT-4o Vision against the uploaded icon + screenshots and return
 * structured AI-generated listing data as JSON.
 */
async function analyzeAppWithAI(
  manifest: Record<string, unknown>,
  iconUrl: string | null,
  screenshotUrls: string[],
): Promise<AiLaunchGeneratedData> {
  const imageInputs: any[] = [];

  // Add icon
  if (iconUrl) {
    imageInputs.push({
      type: "image_url",
      image_url: { url: iconUrl, detail: "low" },
    });
  }

  // Add up to 5 screenshots
  for (const url of screenshotUrls.slice(0, 5)) {
    imageInputs.push({
      type: "image_url",
      image_url: { url, detail: "low" },
    });
  }

  const manifestHint = Object.keys(manifest).length
    ? `Developer-provided hints from app.json: ${JSON.stringify(manifest, null, 2)}\n\n`
    : "";

  const categoryList = AFRICA_CATEGORIES.join(", ");

  const userContent: any[] = [
    {
      type: "text",
      text: `${manifestHint}Analyze these app visuals and generate a compelling app store listing.
Return ONLY valid JSON (no markdown, no code fences) matching this exact shape:
{
  "name": "string — app name (max 30 chars)",
  "tagline": "string — one punchy sentence (max 80 chars)",
  "description": "string — 3-5 paragraph rich description (200-400 words) highlighting key features, benefits, and target audience",
  "category": "string — pick EXACTLY ONE from: ${categoryList}",
  "platform": "string — one of: android | ios | web | all",
  "keywords": ["array of 5-8 search keywords"],
  "features": ["array of 4-6 bullet-point feature highlights, each starting with an emoji"]
}

Guidelines:
- Write for an African audience — mention Africa/Nigeria context where relevant
- Be specific about what the app actually does (infer from screenshots)
- "tagline" must fit in one line
- "description" should excite users and cover: what it does, who it's for, top 3 features
- If developer hints conflict with visuals, trust the visuals
`,
    },
    ...imageInputs,
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-5.6-luna",
    max_completion_tokens: 1200,
    messages: [
      {
        role: "system",
        content:
          "You are a world-class app store marketing expert. You analyze app screenshots and generate highly compelling, accurate app store listings. Always return valid JSON only.",
      },
      { role: "user", content: userContent },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  // Strip any accidental markdown code fences
  const cleaned = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 60) : undefined,
      tagline: typeof parsed.tagline === "string" ? parsed.tagline.slice(0, 120) : undefined,
      description: typeof parsed.description === "string" ? parsed.description : undefined,
      category: AFRICA_CATEGORIES.includes(parsed.category) ? parsed.category : AFRICA_CATEGORIES[8],
      platform: ["android","ios","web","all"].includes(parsed.platform) ? parsed.platform : "android",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 10).map(String) : [],
      features: Array.isArray(parsed.features) ? parsed.features.slice(0, 8).map(String) : [],
      // Preserve manifest-provided technical fields that AI can't infer
      downloadUrl: manifest.downloadUrl as string | undefined,
      webUrl: manifest.webUrl as string | undefined,
      currentVersion: manifest.version as string | undefined ?? manifest.currentVersion as string | undefined,
      packageName: manifest.packageName as string | undefined,
    };
  } catch {
    logger.warn({ raw }, "ai-launch: failed to parse AI JSON");
    return {
      name: manifest.name as string | undefined,
      tagline: "A powerful app for African users",
      description: "AI analysis could not generate a description. Please fill in manually.",
      category: AFRICA_CATEGORIES[8],
      platform: "android",
      keywords: [],
      features: [],
    };
  }
}

/**
 * The heavy lifting: if a bundleUrl was provided, download the ZIP and extract
 * icon/screenshots from it. Then call GPT-4o Vision on the resolved images and
 * update the session. Runs async after returning the session ID to the client.
 *
 * All images are expected to already be in object storage (uploaded by the
 * browser via presigned PUT URLs). The ZIP bundle is downloaded here server-side
 * so we can extract icon/screenshots/manifest without the file ever going through
 * the API proxy.
 */
async function processBundle(
  sessionId: number,
  bundleUrl: string | null,
  iconUrl: string | null,
  screenshotUrls: string[],
  manifestRaw: string | null,
): Promise<void> {
  try {
    let manifest: Record<string, unknown> = {};
    const extracted: AiLaunchExtractedFiles = {};

    // ── Parse manifest ──────────────────────────────────────────────────────
    if (manifestRaw) {
      try { manifest = JSON.parse(manifestRaw); } catch { /* ignore */ }
    }

    let resolvedIconUrl = iconUrl;
    let resolvedScreenshotUrls = [...screenshotUrls];

    // ── Download + extract ZIP bundle ──────────────────────────────────────
    // The ZIP contains only assets (icon, screenshots, app.json) — not the
    // app binary. We download it back from storage and extract in memory.
    if (bundleUrl) {
      try {
        const zipRes = await fetch(bundleUrl);
        if (zipRes.ok) {
          const zipBuf = Buffer.from(await zipRes.arrayBuffer());
          const zip = new AdmZip(zipBuf);
          const entries = zip.getEntries().sort((a, b) => a.entryName.localeCompare(b.entryName));

          for (const entry of entries) {
            if (entry.isDirectory) continue;
            const name = entry.entryName.toLowerCase();
            const basename = name.split("/").pop() ?? "";

            // Manifest
            if (Object.keys(manifest).length === 0 && isManifestFile(entry.entryName)) {
              try { manifest = JSON.parse(entry.getData().toString("utf8")); } catch { /* skip */ }
            }

            // Icon — first image with "icon" in the path
            if (!resolvedIconUrl && isImageFile(basename) && (basename.includes("icon") || name.includes("icon"))) {
              const url = await uploadImageToStorage(entry.getData(), "image/png");
              if (url) resolvedIconUrl = url;
            }

            // Screenshots — all other images up to 8 total
            if (isImageFile(basename) && !name.includes("icon") && resolvedScreenshotUrls.length < 8) {
              const data = entry.getData();
              if (data.length > 0) {
                const url = await uploadImageToStorage(data, "image/png");
                if (url) resolvedScreenshotUrls.push(url);
              }
            }
          }
        } else {
          logger.warn({ bundleUrl, status: zipRes.status }, "ai-launch: could not fetch ZIP bundle");
        }
      } catch (err) {
        logger.warn({ err }, "ai-launch: ZIP extraction failed — continuing without bundle");
      }
    }

    extracted.manifest = manifest;
    if (resolvedIconUrl) extracted.iconUrl = resolvedIconUrl;
    extracted.screenshotUrls = resolvedScreenshotUrls;

    // ── AI analysis ────────────────────────────────────────────────────────
    const aiGenerated = await analyzeAppWithAI(
      manifest,
      resolvedIconUrl ?? null,
      resolvedScreenshotUrls,
    );

    if (resolvedIconUrl) aiGenerated.iconUrl = resolvedIconUrl;
    aiGenerated.screenshots = resolvedScreenshotUrls;

    // ── Update session → ready ─────────────────────────────────────────────
    await db.update(storeAiLaunchSessionsTable).set({
      status: "ready",
      extractedFiles: extracted,
      aiGenerated,
      updatedAt: new Date(),
    }).where(eq(storeAiLaunchSessionsTable.id, sessionId));

    logger.info({ sessionId }, "ai-launch: session ready");
  } catch (err) {
    logger.error({ err, sessionId }, "ai-launch: processBundle failed");
    await db.update(storeAiLaunchSessionsTable).set({
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "Unknown error",
      updatedAt: new Date(),
    }).where(eq(storeAiLaunchSessionsTable.id, sessionId)).catch(() => {});
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /store/ai-launch/upload
 * Accepts: application/json
 *   - bundleUrl      (optional): URL of a .zip already uploaded to object storage
 *   - iconUrl        (optional): URL of icon image already in object storage
 *   - screenshotUrls (optional): array of screenshot URLs already in object storage
 *   - manifest       (optional): raw JSON string (app.json hints)
 *
 * Files should be uploaded directly to object storage first using
 * POST /store/apps/upload-url (presigned PUT), which bypasses the API proxy
 * entirely and allows files up to 250 MB.
 *
 * Returns: { sessionId, status: "processing" }
 */
router.post("/upload", requireAuth(), async (req: any, res: any) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;

    const {
      bundleUrl,
      iconUrl,
      screenshotUrls,
      manifest,
    } = req.body as {
      bundleUrl?: string;
      iconUrl?: string;
      screenshotUrls?: string[];
      manifest?: string;
    };

    if (!bundleUrl && !iconUrl && (!screenshotUrls || screenshotUrls.length === 0) && !manifest) {
      return void res.status(400).json({ error: "Provide a bundleUrl, iconUrl, screenshotUrls, or manifest." });
    }

    // Create session
    const [session] = await db.insert(storeAiLaunchSessionsTable).values({
      developerId: dev.id,
      status: "processing",
    }).returning();

    // Fire-and-forget background processing
    processBundle(
      session.id,
      bundleUrl ?? null,
      iconUrl ?? null,
      Array.isArray(screenshotUrls) ? screenshotUrls : [],
      manifest ?? null,
    ).catch((err) => logger.error({ err }, "ai-launch: unhandled processBundle error"));

    res.json({ sessionId: session.id, status: "processing" });
  } catch (err) {
    logger.error({ err }, "ai-launch: upload error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /store/ai-launch/:sessionId
 * Returns the current session status, extracted files, and AI-generated data.
 */
router.get("/:sessionId", requireAuth(), async (req: any, res: any) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;

    const sessionId = parseInt(req.params.sessionId, 10);
    if (isNaN(sessionId)) return void res.status(400).json({ error: "Invalid sessionId" });

    const session = await db.query.storeAiLaunchSessionsTable.findFirst({
      where: and(
        eq(storeAiLaunchSessionsTable.id, sessionId),
        eq(storeAiLaunchSessionsTable.developerId, dev.id),
      ),
    });

    if (!session) return void res.status(404).json({ error: "Session not found" });

    res.json({
      sessionId: session.id,
      status: session.status,
      errorMessage: session.errorMessage ?? null,
      extractedFiles: session.extractedFiles ?? {},
      aiGenerated: session.aiGenerated ?? {},
      appId: session.appId ?? null,
    });
  } catch (err) {
    logger.error({ err }, "ai-launch: getSession error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /store/ai-launch/:sessionId/submit
 * Body: final (developer-edited) listing fields.
 * Creates the app and marks the session as submitted.
 */
router.post("/:sessionId/submit", requireAuth(), async (req: any, res: any) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;

    const sessionId = parseInt(req.params.sessionId, 10);
    if (isNaN(sessionId)) return void res.status(400).json({ error: "Invalid sessionId" });

    const session = await db.query.storeAiLaunchSessionsTable.findFirst({
      where: and(
        eq(storeAiLaunchSessionsTable.id, sessionId),
        eq(storeAiLaunchSessionsTable.developerId, dev.id),
      ),
    });

    if (!session) return void res.status(404).json({ error: "Session not found" });
    if (!["ready", "failed"].includes(session.status)) {
      return void res.status(400).json({ error: `Cannot submit a session with status: ${session.status}` });
    }
    if (session.appId) return void res.status(400).json({ error: "App already created from this session." });

    const {
      name, tagline, description, category, platform,
      iconUrl, screenshots, downloadUrl, webUrl,
      currentVersion, packageName,
    } = req.body;

    if (!name || !tagline || !description || !iconUrl || !downloadUrl) {
      return void res.status(400).json({ error: "name, tagline, description, iconUrl, downloadUrl are required." });
    }

    // Package name format check
    if (packageName && !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(packageName)) {
      return void res.status(400).json({ error: "Package name must follow reverse-domain format, e.g. com.example.myapp" });
    }

    const isFeeExempt = dev.feeExempt === true;
    const initialStatus = isFeeExempt ? "pending_review" : "pending_payment";

    let slug = slugify(name);
    // Ensure slug uniqueness
    const existing = await db.query.storeAppsTable.findFirst({ where: eq(storeAppsTable.slug, slug) });
    if (existing) slug = `${slug}-${Date.now()}`;

    const [app] = await db.insert(storeAppsTable).values({
      developerId: dev.id,
      name: name.trim(),
      slug,
      tagline: tagline.trim(),
      description: description.trim(),
      category: AFRICA_CATEGORIES.includes(category) ? category : AFRICA_CATEGORIES[8],
      platform: ["android","ios","web","all"].includes(platform) ? platform : "android",
      iconUrl,
      screenshots: Array.isArray(screenshots) ? screenshots.filter(Boolean) : [],
      downloadUrl,
      webUrl: webUrl || null,
      currentVersion: currentVersion || null,
      packageName: packageName || null,
      status: initialStatus,
      publishingFeePaid: isFeeExempt,
    }).returning();

    // Mark session submitted
    await db.update(storeAiLaunchSessionsTable).set({
      status: "submitted",
      appId: app.id,
      updatedAt: new Date(),
    }).where(eq(storeAiLaunchSessionsTable.id, session.id));

    res.json({
      id: app.id,
      name: app.name,
      slug: app.slug,
      status: app.status,
      feeExempt: isFeeExempt,
    });
  } catch (err) {
    logger.error({ err }, "ai-launch: submit error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /store/ai-launch/:sessionId
 * Discard a session (only when not yet submitted).
 */
router.delete("/:sessionId", requireAuth(), async (req: any, res: any) => {
  try {
    const dev = await requireDeveloper(req, res);
    if (!dev) return;

    const sessionId = parseInt(req.params.sessionId, 10);
    if (isNaN(sessionId)) return void res.status(400).json({ error: "Invalid sessionId" });

    const session = await db.query.storeAiLaunchSessionsTable.findFirst({
      where: and(
        eq(storeAiLaunchSessionsTable.id, sessionId),
        eq(storeAiLaunchSessionsTable.developerId, dev.id),
      ),
    });

    if (!session) return void res.status(404).json({ error: "Session not found" });
    if (session.status === "submitted") return void res.status(400).json({ error: "Cannot delete a submitted session." });

    await db.delete(storeAiLaunchSessionsTable).where(eq(storeAiLaunchSessionsTable.id, session.id));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "ai-launch: delete error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
