import { Router } from "express";
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireExternalAuth, FEATURE_ACCESS } from "../../middlewares/requireExternalAuth";

const router = Router();

function isAdminVendor(clerkUserId: string | null | undefined): boolean {
  if (!clerkUserId) return false;
  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(clerkUserId);
}

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
    isAdmin: isAdminVendor(vendor.clerkUserId),
  });
});

/**
 * PATCH /external/profile
 * Allows the user to update their own vendor profile (name, phone, address, description).
 */
router.patch("/profile", async (req, res) => {
  const { vendorId } = req.externalUser!;
  const {
    name, phone, address, description, logoUrl, gender, country, state, city,
    pushPaymentAlertsEnabled, pushVoiceCampaignAlertsEnabled, pushPostRemindersEnabled,
    pushAiMediaExpiryEnabled, pushFacebookVideoAlertsEnabled, postReminderLeadMinutes,
  } = req.body as {
    name?: string;
    phone?: string;
    address?: string;
    description?: string;
    logoUrl?: string;
    gender?: string;
    country?: string;
    state?: string;
    city?: string;
    pushPaymentAlertsEnabled?: boolean;
    pushVoiceCampaignAlertsEnabled?: boolean;
    pushPostRemindersEnabled?: boolean;
    pushAiMediaExpiryEnabled?: boolean;
    pushFacebookVideoAlertsEnabled?: boolean;
    postReminderLeadMinutes?: number;
  };

  // Validate lead-time preference against the supported options.
  const VALID_LEAD_MINUTES = [15, 30, 60, 240, 1440] as const;
  if (postReminderLeadMinutes !== undefined && !VALID_LEAD_MINUTES.includes(postReminderLeadMinutes as any)) {
    return res.status(400).json({ error: `postReminderLeadMinutes must be one of: ${VALID_LEAD_MINUTES.join(", ")}` });
  }

  const [updated] = await db
    .update(vendorsTable)
    .set({
      ...(name && { name }),
      ...(phone !== undefined && { phone }),
      ...(address !== undefined && { address }),
      ...(description !== undefined && { description }),
      ...(logoUrl !== undefined && { logoUrl }),
      ...(gender !== undefined && { gender }),
      ...(country !== undefined && { country }),
      ...(state !== undefined && { state }),
      ...(city !== undefined && { city }),
      ...(pushPaymentAlertsEnabled !== undefined && { pushPaymentAlertsEnabled }),
      ...(pushVoiceCampaignAlertsEnabled !== undefined && { pushVoiceCampaignAlertsEnabled }),
      ...(pushPostRemindersEnabled !== undefined && { pushPostRemindersEnabled }),
      ...(pushAiMediaExpiryEnabled !== undefined && { pushAiMediaExpiryEnabled }),
      ...(pushFacebookVideoAlertsEnabled !== undefined && { pushFacebookVideoAlertsEnabled }),
      ...(postReminderLeadMinutes !== undefined && { postReminderLeadMinutes }),
      updatedAt: new Date(),
    })
    .where(eq(vendorsTable.id, vendorId))
    .returning();

  return res.json(updated);
});

export default router;
