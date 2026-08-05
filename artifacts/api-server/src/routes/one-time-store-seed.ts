/**
 * ONE-TIME store seeding endpoint.
 * GET /api/admin/store-seed?token=<SEED_TOKEN>
 *
 * Creates:
 *   1. Admin vendor row     → fixes /api/vendors/me 401 on awajimaaai.com
 *   2. Admin developer acct → gates store submission
 *   3. Awajimaa App listing → status=approved, featured
 *   4. APK version v1.0.0
 *
 * Safe to call multiple times — every insert uses ON CONFLICT DO NOTHING.
 * Remove this file after first successful run.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  vendorsTable,
  storeDeveloperAccountsTable,
  storeAppsTable,
  storeAppVersionsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

const SEED_TOKEN = "awa-store-seed-2026-Xk9mPqL4";

const ADMIN_CLERK_ID  = "user_3GpywpmezmPNn9MBlxI4JdO7Kmj";
const ADMIN_EMAIL     = "awajimaaapps@gmail.com";
const APK_URL         =
  "https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/app-store/downloads/" +
  "1785904199246-7f2786647ca2-awajimaa-app-v1.0.0.apk";
const DOWNLOAD_URL    = "https://awajimaaappstore.com/api/store/dl/awajimaa-app";
const APP_SLUG        = "awajimaa-app";

router.get("/admin/store-seed", async (req, res) => {
  if (req.query.token !== SEED_TOKEN) {
    res.status(403).json({ error: "Forbidden — wrong token" });
    return;
  }

  const results: string[] = [];

  try {
    // 1. Vendor row for admin (fixes awajimaaai.com login)
    const vendorInsert = await db
      .insert(vendorsTable as any)
      .values({
        clerkUserId: ADMIN_CLERK_ID,
        name: "Awajimaa Admin",
        email: ADMIN_EMAIL,
        industry: "Technology",
        subscriptionTier: "premium",
      })
      .onConflictDoNothing()
      .returning();
    results.push(vendorInsert.length ? "✓ Vendor row created" : "· Vendor row already exists");

    // 2. Developer account (fee-exempt, pre-activated)
    const devInsert = await db
      .insert(storeDeveloperAccountsTable as any)
      .values({
        clerkUserId: ADMIN_CLERK_ID,
        displayName: "Awajimaa",
        email: ADMIN_EMAIL,
        company: "Awajimaa",
        country: "Nigeria",
        status: "active",
        registrationFeePaid: true,
        feeExempt: true,
      })
      .onConflictDoNothing()
      .returning();
    results.push(devInsert.length ? "✓ Developer account created" : "· Developer account already exists");

    // 3. Get dev id for FK
    const dev = await db.query.storeDeveloperAccountsTable.findFirst({
      where: eq((storeDeveloperAccountsTable as any).clerkUserId, ADMIN_CLERK_ID),
    });
    if (!dev) {
      res.status(500).json({ error: "Developer account not found after insert", results });
      return;
    }

    // 4. App listing
    const appInsert = await db
      .insert(storeAppsTable as any)
      .values({
        developerId: dev.id,
        name: "Awajimaa App",
        slug: APP_SLUG,
        tagline: "Emergency Response & Community Safety",
        description:
          "Awajimaa App is your all-in-one emergency response and community safety platform. " +
          "Get instant access to emergency services, report incidents, connect with your community, " +
          "and stay safe with real-time alerts.",
        category: "Utilities",
        categories: ["Utilities", "Safety", "Community"],
        platform: "android",
        iconUrl: "https://awajimaaai.com/awajimaa-one-pager/awajimaa-logo.png",
        screenshots: [],
        downloadUrl: DOWNLOAD_URL,
        currentVersion: "1.0.0",
        status: "approved",
        isFeatured: true,
        isPlatformApp: true,
        publishingFeePaid: true,
        publishingFeeGateway: "admin_waived",
        publicId: "awa_app_001",
      } as any)
      .onConflictDoNothing()
      .returning();
    results.push(appInsert.length ? "✓ App listing created" : "· App listing already exists");

    // 5. App version
    const app = await db.query.storeAppsTable.findFirst({
      where: eq((storeAppsTable as any).slug, APP_SLUG),
    });
    if (app) {
      const versionInsert = await db
        .insert(storeAppVersionsTable as any)
        .values({
          appId: app.id,
          version: "1.0.0",
          versionCode: 1,
          fileUrl: APK_URL,
          status: "active",
        } as any)
        .onConflictDoNothing()
        .returning();
      results.push(versionInsert.length ? "✓ Version v1.0.0 created" : "· Version already exists");
    }

    res.json({
      ok: true,
      message: "Store seed complete. The Awajimaa App is now live in the store.",
      results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, results });
  }
});

export default router;
