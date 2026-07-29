/**
 * Internal callback routes for the GitHub Actions APK build pipeline.
 *
 * These routes are called by the GitHub Actions workflow, NOT by the
 * vendor-hub frontend. They are protected by a shared secret
 * (MOBILE_APP_CALLBACK_SECRET) checked via the X-Callback-Secret header.
 *
 * Routes:
 *   POST /internal/mobile-app/:recordId/apk   — receive APK binary, store it, mark published
 *   POST /internal/mobile-app/:recordId/fail  — record build failure
 */

import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, vendorMobileAppsTable, storeDeveloperAccountsTable, storeAppsTable } from "@workspace/db";
import { storeGeneratedMedia } from "../lib/generated-media-storage";
import { logger } from "../lib/logger";

const router = Router();

function checkSecret(req: any, res: any): boolean {
  const expected = process.env.MOBILE_APP_CALLBACK_SECRET ?? "";
  const received = req.headers["x-callback-secret"] ?? "";
  if (!expected || received !== expected) {
    res.status(401).json({ error: "Invalid callback secret" });
    return false;
  }
  return true;
}

// ── POST /internal/mobile-app/:recordId/apk ──────────────────────────────────
// Called by GitHub Actions after a successful build.
// Body: raw APK binary (Content-Type: application/octet-stream)
router.post(
  "/internal/mobile-app/:recordId/apk",
  // Raw body needed — must come BEFORE express.json() is applied to this route
  (req: any, _res: any, next: any) => { req.rawBodyNeeded = true; next(); },
  async (req: any, res: any) => {
    if (!checkSecret(req, res)) return;

    const recordId = parseInt(req.params.recordId, 10);
    if (isNaN(recordId)) return void res.status(400).json({ error: "Invalid recordId" });

    const appName = (req.headers["x-app-name"] as string | undefined) ?? "Awajimaa App";

    try {
      // ── Collect binary body ──────────────────────────────────────────────
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const apkBuffer = Buffer.concat(chunks);

      if (apkBuffer.length === 0) {
        return void res.status(400).json({ error: "Empty APK body" });
      }

      logger.info({ recordId, sizeBytes: apkBuffer.length }, "[mobile-app-callback] Received APK");

      // ── Store in object storage ──────────────────────────────────────────
      const stored = await storeGeneratedMedia(apkBuffer, "application/vnd.android.package-archive");

      logger.info({ recordId, publicUrl: stored.publicUrl }, "[mobile-app-callback] APK stored");

      // ── Fetch the vendor_mobile_apps record ──────────────────────────────
      const [record] = await db
        .select()
        .from(vendorMobileAppsTable)
        .where(eq(vendorMobileAppsTable.id, recordId))
        .limit(1);

      if (!record) {
        return void res.status(404).json({ error: "Record not found" });
      }

      // ── Auto-create or update App Store listing ──────────────────────────
      let storeAppId: number | null = record.storeAppId;
      try {
        // Find or create a developer account for this vendor
        const [devAccount] = await db
          .select({ id: storeDeveloperAccountsTable.id })
          .from(storeDeveloperAccountsTable)
          .where(eq(storeDeveloperAccountsTable.vendorId, record.vendorId))
          .limit(1);

        if (devAccount) {
          // Check if a store listing already exists
          if (storeAppId) {
            // Update existing listing
            await db.update(storeAppsTable).set({
              downloadUrl: stored.publicUrl,
              status:      "approved",
              updatedAt:   new Date(),
            }).where(eq(storeAppsTable.id, storeAppId));
          } else {
            // Create new listing
            const [newApp] = await db.insert(storeAppsTable).values({
              developerId:   devAccount.id,
              name:          appName,
              slug:          record.appSlug,
              category:      "business",
              description:   `The official mobile app for ${appName}.`,
              downloadUrl:   stored.publicUrl,
              platform:      "android",
              status:        "approved",
              isPlatformApp: false,
              isFeatured:    false,
              price:         "0",
              currency:      "USD",
            } as any).returning({ id: storeAppsTable.id });
            storeAppId = newApp?.id ?? null;
          }
        }
      } catch (storeErr) {
        // Non-fatal — App Store listing is best-effort
        logger.warn({ storeErr, recordId }, "[mobile-app-callback] Could not create/update store listing (non-fatal)");
      }

      // ── Update build record ──────────────────────────────────────────────
      await db.update(vendorMobileAppsTable).set({
        status:      "published",
        apkUrl:      stored.publicUrl,
        storeAppId,
        updatedAt:   new Date(),
      }).where(eq(vendorMobileAppsTable.id, recordId));

      logger.info({ recordId, storeAppId }, "[mobile-app-callback] Build marked published");
      res.json({ ok: true, apkUrl: stored.publicUrl });
    } catch (err) {
      logger.error({ err, recordId }, "[mobile-app-callback] Error handling APK upload");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ── POST /internal/mobile-app/:recordId/fail ─────────────────────────────────
// Called by GitHub Actions when the build fails.
// Body: { errorMessage: string }
router.post("/internal/mobile-app/:recordId/fail", async (req: any, res: any) => {
  if (!checkSecret(req, res)) return;

  const recordId = parseInt(req.params.recordId, 10);
  if (isNaN(recordId)) return void res.status(400).json({ error: "Invalid recordId" });

  const errorMessage =
    (req.body?.errorMessage as string | undefined) ?? "Build failed";

  try {
    await db.update(vendorMobileAppsTable).set({
      status:       "failed",
      errorMessage: errorMessage.slice(0, 500),
      updatedAt:    new Date(),
    }).where(eq(vendorMobileAppsTable.id, recordId));

    logger.info({ recordId, errorMessage }, "[mobile-app-callback] Build marked failed");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, recordId }, "[mobile-app-callback] Error marking build failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
