/**
 * Mobile App Generation routes
 *
 * POST /vendors/me/mobile-app        — submit website or repo URL, kick off APK build
 * GET  /vendors/me/mobile-app        — get current build status for this vendor
 * DELETE /vendors/me/mobile-app/:id  — cancel / remove a build record
 */

import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, vendorsTable, vendorMobileAppsTable } from "@workspace/db";
import { getAuth, requireAuth } from "@clerk/express";
import { generateVendorApp, toAppSlug, toPackageName } from "../lib/app-generator";
import { logger } from "../lib/logger";

const router = Router();

/** Resolve the vendor row for the authenticated Clerk user. Returns null and sends 401/404 if missing. */
async function getVendor(req: any, res: any) {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return null; }
  return vendor;
}

// ── GET /vendors/me/mobile-app ───────────────────────────────────────────────
router.get("/vendors/me/mobile-app", requireAuth(), async (req: any, res: any) => {
  try {
    const vendor = await getVendor(req, res);
    if (!vendor) return;
    const apps = await db
      .select()
      .from(vendorMobileAppsTable)
      .where(eq(vendorMobileAppsTable.vendorId, vendor.id))
      .orderBy(vendorMobileAppsTable.createdAt);
    res.json({ apps });
  } catch (err) {
    logger.error({ err }, "GET /vendors/me/mobile-app error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /vendors/me/mobile-app ──────────────────────────────────────────────
router.post("/vendors/me/mobile-app", requireAuth(), async (req: any, res: any) => {
  try {
    const vendor = await getVendor(req, res);
    if (!vendor) return;

    const { websiteUrl, repoUrl, source = "website", appName, repoBranch } = req.body;

    if (source === "website" && !websiteUrl)
      return void res.status(400).json({ error: "websiteUrl is required for source=website" });
    if (source !== "website" && !repoUrl)
      return void res.status(400).json({ error: "repoUrl is required for repo sources" });

    const targetUrl = (source === "website" ? websiteUrl : repoUrl) as string;
    try { new URL(targetUrl); } catch {
      return void res.status(400).json({ error: "Provide a valid URL (include https://)" });
    }

    // Prevent two simultaneous builds
    const [existing] = await db
      .select({ id: vendorMobileAppsTable.id })
      .from(vendorMobileAppsTable)
      .where(and(eq(vendorMobileAppsTable.vendorId, vendor.id), eq(vendorMobileAppsTable.status, "building")))
      .limit(1);
    if (existing)
      return void res.status(409).json({ error: "A build is already in progress. Wait for it to finish." });

    const slug        = toAppSlug(vendor.name, vendor.id);
    const packageName = toPackageName(slug);
    const finalName   = ((appName as string | undefined) ?? vendor.name).slice(0, 30);

    const [record] = await db
      .insert(vendorMobileAppsTable)
      .values({
        vendorId:    vendor.id,
        source,
        websiteUrl:  source === "website" ? (websiteUrl as string) : null,
        repoUrl:     source !== "website" ? (repoUrl as string)    : null,
        repoBranch:  (repoBranch as string | undefined) ?? null,
        appName:     finalName,
        appSlug:     slug,
        packageName,
        iconUrl:     vendor.logoUrl ?? null,
        status:      "building",
      })
      .returning();

    res.status(202).json({ app: record });

    // Fire-and-forget build trigger
    void (async () => {
      try {
        const result = await generateVendorApp({
          vendorId:   vendor.id,
          vendorName: vendor.name,
          websiteUrl: targetUrl,
          iconUrl:    vendor.logoUrl,
          appName:    finalName,
        });
        await db.update(vendorMobileAppsTable).set({
          easBuildId:  result.easBuildId,
          appSlug:     result.slug,
          packageName: result.packageName,
          status:      "building",
          updatedAt:   new Date(),
        }).where(eq(vendorMobileAppsTable.id, record.id));
        logger.info({ recordId: record.id, easBuildId: result.easBuildId }, "[mobile-apps] build queued");
      } catch (err: any) {
        logger.error({ err, recordId: record.id }, "[mobile-apps] build trigger failed");
        await db.update(vendorMobileAppsTable).set({
          status: "failed", errorMessage: err?.message ?? "Unknown error", updatedAt: new Date(),
        }).where(eq(vendorMobileAppsTable.id, record.id));
      }
    })();
  } catch (err) {
    logger.error({ err }, "POST /vendors/me/mobile-app error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /vendors/me/mobile-app/:id ────────────────────────────────────────
router.delete("/vendors/me/mobile-app/:id", requireAuth(), async (req: any, res: any) => {
  try {
    const vendor = await getVendor(req, res);
    if (!vendor) return;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });
    const [deleted] = await db
      .delete(vendorMobileAppsTable)
      .where(and(eq(vendorMobileAppsTable.id, id), eq(vendorMobileAppsTable.vendorId, vendor.id)))
      .returning({ id: vendorMobileAppsTable.id });
    if (!deleted) return void res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /vendors/me/mobile-app/:id error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
