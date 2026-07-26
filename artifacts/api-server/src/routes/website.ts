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
    const { fileName, contentType } = req.body as { fileName: string; contentType: string };
    const key = `vendor-${vendor.id}/website/logo-${Date.now()}-${fileName}`;
    const { uploadUrl, publicUrl } = await objectStorageService.getObjectEntityUploadURL(key, contentType);
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
    const { fileName, contentType, sectionId } = req.body as { fileName: string; contentType: string; sectionId?: string };
    const key = `vendor-${vendor.id}/website/${sectionId ?? "section"}-${Date.now()}-${fileName}`;
    const { uploadUrl, publicUrl } = await objectStorageService.getObjectEntityUploadURL(key, contentType);
    res.json({ uploadUrl, imageUrl: publicUrl });
  } catch (e: unknown) {
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

export default router;
