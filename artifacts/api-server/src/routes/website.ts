import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, vendorWebsitesTable, vendorsTable } from "@workspace/db";
import { TEMPLATES, generateSlug, type TemplateId } from "../lib/website-templates";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorageService = new ObjectStorageService();
import type { SiteSection } from "@workspace/db";

const router: IRouter = Router();

async function resolveAuthedVendor(req: import("express").Request) {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const [vendor] = await db
    .select({ id: vendorsTable.id, name: vendorsTable.name, email: vendorsTable.email })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, userId));
  return vendor ?? null;
}

/** Ensure a website row exists for the vendor; create default if not. */
async function ensureWebsite(vendorId: number, vendorName: string, vendorEmail: string) {
  const [existing] = await db
    .select()
    .from(vendorWebsitesTable)
    .where(eq(vendorWebsitesTable.vendorId, vendorId));
  if (existing) return existing;

  const slug = generateSlug(vendorName, vendorId);
  const template = TEMPLATES["modern-shop"];
  const defaultSections = template.defaultSections.map(s =>
    s.type === "contact" ? { ...s, content: { ...s.content, email: vendorEmail } } : s
  );

  const [created] = await db
    .insert(vendorWebsitesTable)
    .values({
      vendorId,
      slug,
      templateId: "modern-shop",
      themeColor: template.palette.primary,
      published: false,
      sectionsJson: defaultSections,
      pageTitle: vendorName,
      metaDescription: `Welcome to ${vendorName}`,
    })
    .returning();
  return created!;
}

// ── GET /api/website ──────────────────────────────────────────────────────────
router.get("/website", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const site = await ensureWebsite(vendor.id, vendor.name, vendor.email ?? "");
  const template = TEMPLATES[site.templateId as TemplateId] ?? TEMPLATES["modern-shop"];

  res.json({
    ...site,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
    publishedAt: site.publishedAt?.toISOString() ?? null,
    availableTemplates: Object.values(TEMPLATES).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      palette: t.palette,
    })),
    templatePalette: template.palette,
  });
});

// ── PUT /api/website ──────────────────────────────────────────────────────────
router.put("/website", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  await ensureWebsite(vendor.id, vendor.name, vendor.email ?? "");

  const { templateId, themeColor, sections, pageTitle, metaDescription, logoUrl } = req.body as {
    templateId?: string;
    themeColor?: string;
    sections?: SiteSection[];
    pageTitle?: string;
    metaDescription?: string;
    logoUrl?: string;
  };

  const updates: Partial<typeof vendorWebsitesTable.$inferInsert> = {};
  if (templateId && TEMPLATES[templateId as TemplateId]) {
    updates.templateId = templateId;
    // If template changes, apply new default sections but preserve user edits
    if (req.body.resetSections) {
      updates.sectionsJson = TEMPLATES[templateId as TemplateId].defaultSections;
    }
  }
  if (themeColor) updates.themeColor = themeColor;
  if (sections) updates.sectionsJson = sections;
  if (pageTitle !== undefined) updates.pageTitle = pageTitle;
  if (metaDescription !== undefined) updates.metaDescription = metaDescription;
  if (logoUrl !== undefined) updates.logoUrl = logoUrl;

  const [updated] = await db
    .update(vendorWebsitesTable)
    .set(updates)
    .where(eq(vendorWebsitesTable.vendorId, vendor.id))
    .returning();

  res.json({
    ...updated,
    createdAt: updated!.createdAt.toISOString(),
    updatedAt: updated!.updatedAt.toISOString(),
    publishedAt: updated!.publishedAt?.toISOString() ?? null,
  });
});

// ── POST /api/website/publish ─────────────────────────────────────────────────
router.post("/website/publish", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [site] = await db.select().from(vendorWebsitesTable).where(eq(vendorWebsitesTable.vendorId, vendor.id));
  if (!site) { res.status(404).json({ error: "No website found. Save a draft first." }); return; }

  const [updated] = await db
    .update(vendorWebsitesTable)
    .set({ published: true, publishedAt: new Date() })
    .where(eq(vendorWebsitesTable.vendorId, vendor.id))
    .returning();

  res.json({
    ...updated,
    createdAt: updated!.createdAt.toISOString(),
    updatedAt: updated!.updatedAt.toISOString(),
    publishedAt: updated!.publishedAt?.toISOString() ?? null,
  });
});

// ── POST /api/website/unpublish ───────────────────────────────────────────────
router.post("/website/unpublish", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [updated] = await db
    .update(vendorWebsitesTable)
    .set({ published: false })
    .where(eq(vendorWebsitesTable.vendorId, vendor.id))
    .returning();

  if (!updated) { res.status(404).json({ error: "No website found" }); return; }

  res.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    publishedAt: updated.publishedAt?.toISOString() ?? null,
  });
});

// ── POST /api/website/upload-logo ─────────────────────────────────────────────
router.post("/website/upload-logo", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
    const _op1 = objectStorageService.normalizeObjectEntityPath(uploadUrl);
    const _oid1 = _op1.replace(/^\/objects\/uploads\//, "");
    const _base1 = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN || "";
    const publicUrl = `https://${_base1}/api/media/${_oid1}`;
    res.json({ uploadUrl, logoUrl: publicUrl });
  } catch (e: unknown) {
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// ── POST /api/website/upload-image ────────────────────────────────────────────
router.post("/website/upload-image", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const uploadUrl2 = await objectStorageService.getObjectEntityUploadURL();
    const _op2 = objectStorageService.normalizeObjectEntityPath(uploadUrl2);
    const _oid2 = _op2.replace(/^\/objects\/uploads\//, "");
    const _base2 = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN || "";
    const publicUrl2 = `https://${_base2}/api/media/${_oid2}`;
    res.json({ uploadUrl: uploadUrl2, imageUrl: publicUrl2 });
  } catch (e: unknown) {
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// ── POST /api/website/generate-logo ──────────────────────────────────────────
router.post("/website/generate-logo", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { businessName, description } = req.body as { businessName?: string; description?: string };
  if (!businessName) { res.status(400).json({ error: "businessName is required" }); return; }

  try {
    const openAiBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    const openAiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "";

    const prompt = [
      `Professional minimalist logo mark for the business "${businessName}".`,
      description ? `The business is: ${description}.` : "",
      "Flat vector style icon, bold geometric shapes, vibrant single-color or two-tone palette.",
      "Clean white background. No text, no words, no letters — icon only.",
      "Suitable for a website favicon and header. High contrast, modern, memorable.",
    ].filter(Boolean).join(" ");

    const genRes = await fetch(`${openAiBase}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
      body: JSON.stringify({ model: "dall-e-3", prompt, n: 1, size: "1024x1024", quality: "standard", response_format: "url" }),
    });

    if (!genRes.ok) {
      const errText = await genRes.text();
      res.status(500).json({ error: "AI generation failed", detail: errText });
      return;
    }

    const genData = await genRes.json() as { data: Array<{ url: string }> };
    const tempUrl = genData.data[0]?.url;
    if (!tempUrl) { res.status(500).json({ error: "No image returned from AI" }); return; }

    // Download the temp image and re-upload to permanent object storage
    const imgRes = await fetch(tempUrl);
    const imgBuffer = await imgRes.arrayBuffer();
    const uploadUrl3 = await objectStorageService.getObjectEntityUploadURL();
    const _op3 = objectStorageService.normalizeObjectEntityPath(uploadUrl3);
    const _oid3 = _op3.replace(/^\/objects\/uploads\//, "");
    const _base3 = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN || "";
    const publicUrl3 = `https://${_base3}/api/media/${_oid3}`;

    await fetch(uploadUrl3, {
      method: "PUT",
      body: imgBuffer,
      headers: { "Content-Type": "image/png" },
    });

    res.json({ logoUrl: publicUrl3 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: "Failed to generate logo", detail: msg });
  }
});

// ── POST /api/website/generate-taglines ──────────────────────────────────────
router.post("/website/generate-taglines", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { businessName, description } = req.body as { businessName?: string; description?: string };
  if (!businessName) { res.status(400).json({ error: "businessName is required" }); return; }

  try {
    const openAiBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    const openAiKey  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "";

    const systemMsg = [
      "You are a world-class creative copywriter. Generate exactly 5 unique, punchy business taglines.",
      "Each tagline: 3–9 words, memorable, action-oriented or evocative, distinct from each other.",
      "Return ONLY a valid JSON array of 5 strings — no extra text, no markdown.",
    ].join(" ");

    const userMsg = `Business: "${businessName}"${description ? `\nWhat it does: ${description}` : ""}`;

    const chatRes = await fetch(`${openAiBase}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemMsg }, { role: "user", content: userMsg }],
        temperature: 0.92,
        max_tokens: 250,
      }),
    });

    if (!chatRes.ok) { res.status(500).json({ error: "AI generation failed" }); return; }

    const chatData = await chatRes.json() as { choices: Array<{ message: { content: string } }> };
    const raw = chatData.choices[0]?.message?.content ?? "[]";

    let taglines: string[] = [];
    try { taglines = JSON.parse(raw); } catch { taglines = []; }
    if (!Array.isArray(taglines)) taglines = [];

    res.json({ taglines: taglines.slice(0, 5) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: "Failed to generate taglines", detail: msg });
  }
});

export default router;
