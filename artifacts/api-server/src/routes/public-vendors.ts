import { Router, type IRouter } from "express";
import { eq, and, isNotNull, ne, count, sql } from "drizzle-orm";
import { db, vendorsTable } from "@workspace/db";
import { BRAND_THEMES } from "../lib/brand-themes";

const router: IRouter = Router();

/** Preset color themes vendors can choose for their storefront — public so the picker/storefront can render without auth. */
router.get("/public/brand-themes", (_req, res): void => {
  res.json(BRAND_THEMES);
});

/**
 * Public storefront data for a single vendor. Only exposes fields safe to show
 * to customers — no email, phone, address, or subscription/verification internals.
 */
router.get("/public/vendors/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid vendor id" });
    return;
  }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id));
  if (!vendor || vendor.status !== "active") {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.json({
    id: vendor.id,
    name: vendor.name,
    industry: vendor.industry,
    website: vendor.website,
    logoUrl: vendor.logoUrl,
    description: vendor.description,
    brandTheme: vendor.brandTheme,
  });
});

/**
 * Public list of vendors — used by the landing page "Trusted by" section.
 *
 * Strategy for scale:
 *   - totalCount = all active vendors (shown in "Trusted by X+ businesses" badge)
 *   - vendors    = a random sample of up to 40 active vendors WITH a logo
 *                  ORDER BY RANDOM() so every page visit shows a different set;
 *                  React Query caches for 10 min on the client.
 *
 * Each vendor includes `website` so the frontend can link cards to their site.
 * Only exposes safe public fields — no PII.
 */
router.get("/public/trusted-vendors", async (_req, res): Promise<void> => {
  // Run both queries in parallel
  const [countResult, rows] = await Promise.all([
    // Total active vendor count (all tiers, with or without logo)
    db
      .select({ total: count() })
      .from(vendorsTable)
      .where(eq(vendorsTable.status, "active")),

    // Random sample of active vendors that have a real logo
    db
      .select({
        id:      vendorsTable.id,
        name:    vendorsTable.name,
        logoUrl: vendorsTable.logoUrl,
        industry: vendorsTable.industry,
        website: vendorsTable.website,
      })
      .from(vendorsTable)
      .where(
        and(
          eq(vendorsTable.status, "active"),
          isNotNull(vendorsTable.logoUrl),
          ne(vendorsTable.logoUrl, ""),
        ),
      )
      .orderBy(sql`RANDOM()`)
      .limit(40),
  ]);

  // Extra JS filter for whitespace-only logo strings
  const vendors = rows.filter((v) => v.logoUrl?.trim());
  const totalCount = countResult[0]?.total ?? vendors.length;

  res.json({ totalCount, vendors });
});

export default router;
