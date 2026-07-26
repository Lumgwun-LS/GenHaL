/**
 * Public (unauthenticated) website routes.
 * Mounted before requireAuth in routes/index.ts.
 */
import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, vendorWebsitesTable, vendorsTable } from "@workspace/db";
import { TEMPLATES } from "../lib/website-templates";

const router: IRouter = Router();

/** GET /api/sites/:slug — public, returns published site data */
router.get("/sites/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;

  const [site] = await db
    .select({
      id: vendorWebsitesTable.id,
      slug: vendorWebsitesTable.slug,
      templateId: vendorWebsitesTable.templateId,
      themeColor: vendorWebsitesTable.themeColor,
      sectionsJson: vendorWebsitesTable.sectionsJson,
      pageTitle: vendorWebsitesTable.pageTitle,
      metaDescription: vendorWebsitesTable.metaDescription,
      logoUrl: vendorWebsitesTable.logoUrl,
      publishedAt: vendorWebsitesTable.publishedAt,
      vendorName: vendorsTable.name,
      vendorEmail: vendorsTable.email,
      vendorPhone: vendorsTable.phone,
      vendorAddress: vendorsTable.address,
      vendorCategory: vendorsTable.category,
    })
    .from(vendorWebsitesTable)
    .innerJoin(vendorsTable, eq(vendorWebsitesTable.vendorId, vendorsTable.id))
    .where(and(
      eq(vendorWebsitesTable.slug, slug),
      eq(vendorWebsitesTable.published, true),
    ));

  if (!site) {
    res.status(404).json({ error: "Site not found or not published" });
    return;
  }

  const template = TEMPLATES[site.templateId as keyof typeof TEMPLATES] ?? TEMPLATES["modern-shop"];

  res.json({
    slug: site.slug,
    templateId: site.templateId,
    themeColor: site.themeColor,
    sections: site.sectionsJson,
    pageTitle: site.pageTitle ?? site.vendorName,
    metaDescription: site.metaDescription ?? "",
    logoUrl: site.logoUrl,
    publishedAt: site.publishedAt,
    vendor: {
      name: site.vendorName,
      email: site.vendorEmail,
      phone: site.vendorPhone,
      address: site.vendorAddress,
      category: site.vendorCategory,
    },
    template: {
      id: template.id,
      name: template.name,
      palette: template.palette,
      primaryFont: template.primaryFont,
    },
  });
});

export default router;
