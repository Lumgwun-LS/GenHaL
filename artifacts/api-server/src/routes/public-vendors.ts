import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
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

export default router;
