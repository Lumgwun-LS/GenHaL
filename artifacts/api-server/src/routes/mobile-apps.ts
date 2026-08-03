/**
 * Mobile App Generation routes
 *
 * POST /vendors/me/mobile-app/checkout          — pay $100 via Squad and queue a build
 * POST /vendors/me/mobile-app/payment/verify    — manually verify Squad payment + trigger build
 * GET  /vendors/me/mobile-app/payment/callback  — Squad redirect after checkout
 * POST /vendors/me/mobile-app/:id/payment/reinitiate — re-open Squad checkout for pending record
 * GET  /vendors/me/mobile-app                   — get build history for this vendor
 * POST /vendors/me/mobile-app/:id/retry         — retry a failed build (fee already paid)
 * DELETE /vendors/me/mobile-app/:id             — remove a build record
 * POST /admin/mobile-apps/:id/retry             — admin: retry any vendor's build
 * GET  /admin/mobile-apps                       — admin: list all builds
 */

import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, vendorsTable, vendorMobileAppsTable } from "@workspace/db";
import { getAuth, requireAuth } from "@clerk/express";
import { generateVendorApp, toAppSlug, toPackageName } from "../lib/app-generator";
import { resolveSquadKey, squadInitiatePayment, squadVerifyTransaction } from "../lib/squad";
import { logger } from "../lib/logger";

const router = Router();

/** One-time build fee: $100 USD = 10 000 cents */
const BUILD_FEE_USD_CENTS = 10_000;

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

/** Build trigger shared by checkout-verify and retry flows */
async function triggerBuild(record: typeof vendorMobileAppsTable.$inferSelect, vendor: typeof vendorsTable.$inferSelect) {
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
        status: "failed", errorMessage: err?.message ?? "Build trigger failed", updatedAt: new Date(),
      }).where(eq(vendorMobileAppsTable.id, record.id));
    }
  })();
}

// ── POST /vendors/me/mobile-app/checkout ─────────────────────────────────────
// Creates a pending_payment build record and returns a Squad $100 checkout URL.
router.post("/vendors/me/mobile-app/checkout", requireAuth(), async (req: any, res: any) => {
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

    // Block if a build is actively running
    const [building] = await db
      .select({ id: vendorMobileAppsTable.id })
      .from(vendorMobileAppsTable)
      .where(and(eq(vendorMobileAppsTable.vendorId, vendor.id), eq(vendorMobileAppsTable.status, "building")))
      .limit(1);
    if (building)
      return void res.status(409).json({ error: "A build is already in progress. Wait for it to finish." });

    const slug        = toAppSlug(vendor.name, vendor.id);
    const packageName = toPackageName(slug);
    const finalName   = ((appName as string | undefined) ?? vendor.name).slice(0, 30);

    // Super-admins bypass Squad payment — build starts immediately
    const { userId } = getAuth(req);
    const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const isAdmin = userId ? adminIds.includes(userId) : false;

    if (isAdmin) {
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
          feePaid:     true,
          feeAmount:   0,
        })
        .returning();
      res.status(202).json({ app: serializeApp(record), adminBypass: true });
      triggerBuild(record, vendor);
      return;
    }

    // Create record in pending_payment state
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
        status:      "pending_payment",
        feeAmount:   BUILD_FEE_USD_CENTS,
      })
      .returning();

    // Initiate Squad checkout
    try {
      const secretKey     = await resolveSquadKey();
      const transactionRef = `MABLD-${vendor.id}-${record.id}-${Date.now()}`;
      const host           = `${req.protocol}://${req.get("host")}`;
      const callbackUrl    = `${host}/api/vendors/me/mobile-app/payment/callback?transaction_ref=${transactionRef}`;

      const result = await squadInitiatePayment(secretKey, {
        email:          vendor.email,
        amount:         BUILD_FEE_USD_CENTS,
        currency:       "USD",
        transactionRef,
        customerName:   vendor.name,
        callbackUrl,
        metadata:       { purpose: "mobile_app_build_fee", recordId: record.id, vendorId: vendor.id },
      });

      await db.update(vendorMobileAppsTable).set({
        feeRef: transactionRef, updatedAt: new Date(),
      }).where(eq(vendorMobileAppsTable.id, record.id));

      res.json({ app: { ...record, feeRef: transactionRef }, checkoutUrl: result.data.checkout_url });
    } catch (err: any) {
      // Clean up the record if Squad fails to initiate
      await db.delete(vendorMobileAppsTable).where(eq(vendorMobileAppsTable.id, record.id)).catch(() => {});
      logger.error({ err }, "[mobile-apps] Squad checkout initiation failed");
      res.status(502).json({ error: err?.message ?? "Payment gateway error. Please try again." });
    }
  } catch (err) {
    logger.error({ err }, "POST /vendors/me/mobile-app/checkout error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /vendors/me/mobile-app/payment/verify ───────────────────────────────
// Frontend calls this after Squad redirects back, to confirm payment and start build.
router.post("/vendors/me/mobile-app/payment/verify", requireAuth(), async (req: any, res: any) => {
  try {
    const vendor = await getVendor(req, res);
    if (!vendor) return;

    const { transactionRef } = req.body;
    if (!transactionRef)
      return void res.status(400).json({ error: "transactionRef is required" });

    const [record] = await db
      .select()
      .from(vendorMobileAppsTable)
      .where(and(eq(vendorMobileAppsTable.feeRef, transactionRef), eq(vendorMobileAppsTable.vendorId, vendor.id)))
      .limit(1);
    if (!record) return void res.status(404).json({ error: "Build record not found for this reference" });
    if (record.feePaid) return res.json({ ok: true, alreadyPaid: true, app: serializeApp(record) });

    const secretKey = await resolveSquadKey();
    const verify    = await squadVerifyTransaction(secretKey, transactionRef);

    if (verify.data.transaction_status !== "Success")
      return void res.status(402).json({ error: "Payment not completed yet", transactionStatus: verify.data.transaction_status });

    await db.update(vendorMobileAppsTable).set({
      feePaid: true, status: "building", updatedAt: new Date(),
    }).where(eq(vendorMobileAppsTable.id, record.id));

    triggerBuild({ ...record, status: "building", feePaid: true }, vendor);
    res.json({ ok: true, app: serializeApp({ ...record, feePaid: true, status: "building" }) });
  } catch (err: any) {
    logger.error({ err }, "POST /vendors/me/mobile-app/payment/verify error");
    res.status(500).json({ error: err?.message ?? "Verification failed" });
  }
});

// ── GET /vendors/me/mobile-app/payment/callback ───────────────────────────────
// Squad redirects the buyer here after checkout. Verifies and triggers build.
router.get("/vendors/me/mobile-app/payment/callback", async (req: any, res: any) => {
  const { transaction_ref } = req.query as { transaction_ref?: string };
  // Frontend base — vendor-hub is path-mounted at /vendor-hub
  const frontendBase = "/vendor-hub/mobile-app";

  if (!transaction_ref)
    return res.redirect(`${frontendBase}?payment_error=missing_ref`);

  try {
    const [record] = await db
      .select()
      .from(vendorMobileAppsTable)
      .where(eq(vendorMobileAppsTable.feeRef, transaction_ref))
      .limit(1);

    if (!record)
      return res.redirect(`${frontendBase}?payment_error=not_found`);
    if (record.feePaid)
      return res.redirect(`${frontendBase}?build_id=${record.id}&paid=1`);

    const secretKey = await resolveSquadKey();
    const verify    = await squadVerifyTransaction(secretKey, transaction_ref);

    if (verify.data.transaction_status !== "Success")
      return res.redirect(`${frontendBase}?payment_error=payment_failed&build_id=${record.id}&ref=${transaction_ref}`);

    await db.update(vendorMobileAppsTable).set({
      feePaid: true, status: "building", updatedAt: new Date(),
    }).where(eq(vendorMobileAppsTable.id, record.id));

    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, record.vendorId));
    if (vendor) triggerBuild({ ...record, status: "building", feePaid: true }, vendor);

    res.redirect(`${frontendBase}?build_id=${record.id}&paid=1`);
  } catch (err: any) {
    logger.error({ err }, "GET /vendors/me/mobile-app/payment/callback error");
    res.redirect(`${frontendBase}?payment_error=verification_failed`);
  }
});

// ── POST /vendors/me/mobile-app/:id/payment/reinitiate ───────────────────────
// Re-opens Squad checkout for an existing pending_payment record (e.g. expired link).
router.post("/vendors/me/mobile-app/:id/payment/reinitiate", requireAuth(), async (req: any, res: any) => {
  try {
    const vendor = await getVendor(req, res);
    if (!vendor) return;

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Invalid id" });

    const [record] = await db
      .select()
      .from(vendorMobileAppsTable)
      .where(and(eq(vendorMobileAppsTable.id, id), eq(vendorMobileAppsTable.vendorId, vendor.id)));
    if (!record)                           return void res.status(404).json({ error: "Not found" });
    if (record.feePaid)                    return void res.status(409).json({ error: "Already paid — build is in progress" });
    if (record.status !== "pending_payment") return void res.status(409).json({ error: "Cannot re-initiate for this build status" });

    const secretKey      = await resolveSquadKey();
    const transactionRef = `MABLD-${vendor.id}-${record.id}-${Date.now()}`;
    const host           = `${req.protocol}://${req.get("host")}`;
    const callbackUrl    = `${host}/api/vendors/me/mobile-app/payment/callback?transaction_ref=${transactionRef}`;

    const result = await squadInitiatePayment(secretKey, {
      email:          vendor.email,
      amount:         BUILD_FEE_USD_CENTS,
      currency:       "USD",
      transactionRef,
      customerName:   vendor.name,
      callbackUrl,
      metadata:       { purpose: "mobile_app_build_fee", recordId: record.id, vendorId: vendor.id },
    });

    await db.update(vendorMobileAppsTable).set({
      feeRef: transactionRef, updatedAt: new Date(),
    }).where(eq(vendorMobileAppsTable.id, id));

    res.json({ checkoutUrl: result.data.checkout_url, transactionRef });
  } catch (err: any) {
    logger.error({ err }, "POST /vendors/me/mobile-app/:id/payment/reinitiate error");
    res.status(502).json({ error: err?.message ?? "Payment gateway error. Please try again." });
  }
});

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
    res.json({ apps: apps.map(serializeApp) });
  } catch (err) {
    logger.error({ err }, "GET /vendors/me/mobile-app error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /vendors/me/mobile-app/:id/retry ────────────────────────────────────
// Lets a vendor re-trigger the GitHub Actions build for their own failed record.
// The fee must already have been paid.
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
    if (!record.feePaid) return void res.status(402).json({ error: "Payment required before retrying" });
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

    await db.update(vendorMobileAppsTable).set({
      status: "building", errorMessage: null, updatedAt: new Date(),
    }).where(eq(vendorMobileAppsTable.id, id));

    res.json({ ok: true, message: "Retry started" });
    triggerBuild({ ...record, status: "building" }, vendor);
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

    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, record.vendorId));
    if (!vendor) return void res.status(404).json({ error: "Vendor not found for this build" });

    await db.update(vendorMobileAppsTable).set({
      status: "building", errorMessage: null, updatedAt: new Date(),
    }).where(eq(vendorMobileAppsTable.id, id));

    res.json({ ok: true, message: "Admin retry started", recordId: id });
    triggerBuild({ ...record, status: "building" }, vendor);
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
        feePaid:      vendorMobileAppsTable.feePaid,
        feeAmount:    vendorMobileAppsTable.feeAmount,
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

// ── helpers ───────────────────────────────────────────────────────────────────
function serializeApp(app: typeof vendorMobileAppsTable.$inferSelect & { [k: string]: any }) {
  return {
    ...app,
    createdAt: app.createdAt instanceof Date ? app.createdAt.toISOString() : String(app.createdAt ?? ""),
    updatedAt: app.updatedAt instanceof Date ? app.updatedAt.toISOString() : String(app.updatedAt ?? ""),
    lastCheckedAt: app.lastCheckedAt instanceof Date ? app.lastCheckedAt.toISOString() : (app.lastCheckedAt ?? null),
  };
}

export default router;
