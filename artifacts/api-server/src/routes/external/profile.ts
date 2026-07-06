import { Router } from "express";
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireExternalAuth, FEATURE_ACCESS } from "../../middlewares/requireExternalAuth";

const router = Router();

router.use(requireExternalAuth);

/**
 * GET /external/profile
 * Returns the Awajimaa user's VendorHub vendor profile + enabled features.
 */
router.get("/profile", async (req, res) => {
  const { vendorId, awajimaaUserType } = req.externalUser!;

  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendorId))
    .limit(1);

  if (!vendor) return res.status(404).json({ error: "Vendor profile not found" });

  return res.json({
    vendor,
    features: FEATURE_ACCESS[awajimaaUserType] ?? [],
  });
});

/**
 * PATCH /external/profile
 * Allows the user to update their own vendor profile (name, phone, address, description).
 */
router.patch("/profile", async (req, res) => {
  const { vendorId } = req.externalUser!;
  const { name, phone, address, description, logoUrl } = req.body as {
    name?: string;
    phone?: string;
    address?: string;
    description?: string;
    logoUrl?: string;
  };

  const [updated] = await db
    .update(vendorsTable)
    .set({
      ...(name && { name }),
      ...(phone !== undefined && { phone }),
      ...(address !== undefined && { address }),
      ...(description !== undefined && { description }),
      ...(logoUrl !== undefined && { logoUrl }),
      updatedAt: new Date(),
    })
    .where(eq(vendorsTable.id, vendorId))
    .returning();

  return res.json(updated);
});

export default router;
