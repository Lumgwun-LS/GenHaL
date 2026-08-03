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

/** Resolve the vendor row for the authenticated Clerk user.
 *  Admins (ADMIN_USER_IDS) get an auto-created enterprise vendor record so they
 *  can test all features without going through onboarding. */
async function getVendor(req: any, res: any) {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  if (vendor) return vendor;

  // Auto-create a vendor record for admins so they can test features freely
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!adminIds.includes(userId)) {
    res.status(404).json({ error: "Vendor not found" });
    return null;
  }

  logger.info({ userId }, "[mobile-apps] Admin has no vendor row — auto-creating one");
  const trialExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
  const [created] = await db
    .insert(vendorsTable)
    .values({
      clerkUserId:          userId,
      name:                 "Admin Account",
      email:                `${userId}@admin.awajimaa.internal`,
      industry:             "Technology",
      subscriptionTier:     "enterprise",
      billingBlocked:       false,
      featureTrialTier:     "enterprise",
      featureTrialExpiresAt: trialExpiresAt,
      featureTrialGrantedBy: "system",
      featureTrialGrantedAt: new Date(),
      featureTrialNote:     "Auto-granted to admin account",
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  // Race condition — another request inserted first; just fetch it
  const [refetch] = await db.select().from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId));
  if (refetch) return refetch;

  res.status(500).json({ error: "Could not create admin vendor record" });
  return null;
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
          recordId:   record.id,
          vendorId:   vendor.id,
          vendorName: vendor.name,
          websiteUrl: targetUrl,
          iconUrl:    vendor.logoUrl,
          appName:    finalName,
        });
        await db.update(vendorMobileAppsTable).set({
          easBuildId:  result.runId,
          appSlug:     result.slug,
          packageName: result.packageName,
          status:      "building",
          updatedAt:   new Date(),
        }).where(eq(vendorMobileAppsTable.id, record.id));
        logger.info({ recordId: record.id, runId: result.runId }, "[mobile-apps] build queued");
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

// ── POST /vendors/me/mobile-app/:id/retry ────────────────────────────────────
// Lets a vendor re-trigger the GitHub Actions build for their own failed record
// without deleting and resubmitting. Blocked if another build is already running.
router.post("/vendors/me/mobile-app/:id/retry", requireAuth(), async (req: any, res: any) => {
  try {
    const vendor = await getVendor(req, res);
    if (!vendor) return;

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });

    const [record] = await db
      .select()
      .from(vendorMobileAppsTable)
      .where(and(eq(vendorMobileAppsTable.id, id), eq(vendorMobileAppsTable.vendorId, vendor.id)));

    if (!record) return void res.status(404).json({ error: "Not found" });
    if (record.status === "building" || record.status === "queued")
      return void res.status(409).json({ error: "Build is already in progress" });

    // Check no other build is already running for this vendor
    const [running] = await db
      .select({ id: vendorMobileAppsTable.id })
      .from(vendorMobileAppsTable)
      .where(and(eq(vendorMobileAppsTable.vendorId, vendor.id), eq(vendorMobileAppsTable.status, "building")))
      .limit(1);
    if (running)
      return void res.status(409).json({ error: "Another build is already in progress. Wait for it to finish." });

    // Reset to building before triggering
    await db.update(vendorMobileAppsTable).set({
      status: "building", errorMessage: null, updatedAt: new Date(),
    }).where(eq(vendorMobileAppsTable.id, id));

    res.json({ ok: true, message: "Retry started" });

    // Fire-and-forget re-dispatch
    const targetUrl = record.websiteUrl ?? record.repoUrl ?? "";
    void (async () => {
      try {
        const result = await generateVendorApp({
          recordId:   record.id,
          vendorId:   vendor.id,
          vendorName: vendor.name,
          websiteUrl: targetUrl,
          iconUrl:    record.iconUrl,
          appName:    record.appName,
        });
        await db.update(vendorMobileAppsTable).set({
          easBuildId: result.runId, status: "building", updatedAt: new Date(),
        }).where(eq(vendorMobileAppsTable.id, id));
        logger.info({ recordId: id, runId: result.runId }, "[mobile-apps] retry build queued");
      } catch (err: any) {
        logger.error({ err, recordId: id }, "[mobile-apps] retry build trigger failed");
        await db.update(vendorMobileAppsTable).set({
          status: "failed", errorMessage: err?.message ?? "Unknown error", updatedAt: new Date(),
        }).where(eq(vendorMobileAppsTable.id, id));
      }
    })();
  } catch (err) {
    logger.error({ err }, "POST /vendors/me/mobile-app/:id/retry error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /admin/mobile-apps/:id/retry ────────────────────────────────────────
// Admin-only: retry any vendor's failed build by record ID.
router.post("/admin/mobile-apps/:id/retry", requireAuth(), async (req: any, res: any) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return void res.status(401).json({ error: "Unauthorized" });
    const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!adminIds.includes(userId)) return void res.status(403).json({ error: "Admin only" });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });

    const [record] = await db.select().from(vendorMobileAppsTable).where(eq(vendorMobileAppsTable.id, id));
    if (!record) return void res.status(404).json({ error: "Not found" });
    if (record.status === "building" || record.status === "queued")
      return void res.status(409).json({ error: "Build is already in progress" });

    // Fetch the vendor record for name/icon
    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, record.vendorId));
    if (!vendor) return void res.status(404).json({ error: "Vendor not found for this build" });

    await db.update(vendorMobileAppsTable).set({
      status: "building", errorMessage: null, updatedAt: new Date(),
    }).where(eq(vendorMobileAppsTable.id, id));

    res.json({ ok: true, message: "Admin retry started", recordId: id });

    const targetUrl = record.websiteUrl ?? record.repoUrl ?? "";
    void (async () => {
      try {
        const result = await generateVendorApp({
          recordId:   record.id,
          vendorId:   vendor.id,
          vendorName: vendor.name,
          websiteUrl: targetUrl,
          iconUrl:    record.iconUrl,
          appName:    record.appName,
        });
        await db.update(vendorMobileAppsTable).set({
          easBuildId: result.runId, status: "building", updatedAt: new Date(),
        }).where(eq(vendorMobileAppsTable.id, id));
        logger.info({ recordId: id, runId: result.runId }, "[mobile-apps] admin retry build queued");
      } catch (err: any) {
        logger.error({ err, recordId: id }, "[mobile-apps] admin retry build trigger failed");
        await db.update(vendorMobileAppsTable).set({
          status: "failed", errorMessage: err?.message ?? "Unknown error", updatedAt: new Date(),
        }).where(eq(vendorMobileAppsTable.id, id));
      }
    })();
  } catch (err) {
    logger.error({ err }, "POST /admin/mobile-apps/:id/retry error");
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

// ── GET /admin/mobile-apps ────────────────────────────────────────────────────
// Admin-only: list all vendor_mobile_apps records with vendor names.
router.get("/admin/mobile-apps", requireAuth(), async (req: any, res: any) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return void res.status(401).json({ error: "Unauthorized" });
    const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!adminIds.includes(userId)) return void res.status(403).json({ error: "Admin only" });

    const rows = await db
      .select({
        id:           vendorMobileAppsTable.id,
        vendorId:     vendorMobileAppsTable.vendorId,
        vendorName:   vendorsTable.name,
        appName:      vendorMobileAppsTable.appName,
        source:       vendorMobileAppsTable.source,
        websiteUrl:   vendorMobileAppsTable.websiteUrl,
        repoUrl:      vendorMobileAppsTable.repoUrl,
        appSlug:      vendorMobileAppsTable.appSlug,
        packageName:  vendorMobileAppsTable.packageName,
        status:       vendorMobileAppsTable.status,
        errorMessage: vendorMobileAppsTable.errorMessage,
        easBuildId:   vendorMobileAppsTable.easBuildId,
        apkUrl:       vendorMobileAppsTable.apkUrl,
        storeAppId:   vendorMobileAppsTable.storeAppId,
        createdAt:    vendorMobileAppsTable.createdAt,
        updatedAt:    vendorMobileAppsTable.updatedAt,
      })
      .from(vendorMobileAppsTable)
      .leftJoin(vendorsTable, eq(vendorsTable.id, vendorMobileAppsTable.vendorId))
      .orderBy(vendorMobileAppsTable.updatedAt);

    const builds = rows.map((r) => ({
      ...r,
      vendorName: r.vendorName ?? `Vendor #${r.vendorId}`,
      createdAt:  r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
      updatedAt:  r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
    }));

    res.json({ builds });
  } catch (err) {
    logger.error({ err }, "GET /admin/mobile-apps error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
