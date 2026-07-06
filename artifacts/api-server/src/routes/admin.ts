/**
 * Admin-only endpoints.
 *
 * GET  /admin/check          — returns { isAdmin: boolean } for the current user
 * GET  /admin/vendors        — all vendors enriched with payment-credential status
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { vendorsTable, vendorPaymentCredentialsTable, birthdayMessageLogsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { canAddPaymentKeys } from "../lib/vendor-keys";

/** Returns true if the calling Clerk user is listed in ADMIN_USER_IDS env var. */
function isAdmin(userId: string): boolean {
  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

const router = Router();

// ─── GET /admin/check ─────────────────────────────────────────────────────────

router.get("/admin/check", (req, res): void => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ isAdmin: isAdmin(userId) });
});

// ─── GET /admin/vendors ───────────────────────────────────────────────────────

router.get("/admin/vendors", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!isAdmin(userId)) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }

  const vendors = await db.select().from(vendorsTable).orderBy(vendorsTable.name);
  const creds = await db.select().from(vendorPaymentCredentialsTable);

  const credsByVendor = new Map(creds.map((c) => [c.vendorId, c]));

  const enriched = vendors.map((v) => {
    const c = credsByVendor.get(v.id);
    return {
      id: v.id,
      name: v.name,
      industry: v.industry,
      status: v.status,
      email: v.email,
      subscriptionTier: v.subscriptionTier,
      verificationLevel: v.verificationLevel,
      featureUnlocked: canAddPaymentKeys(v),
      createdAt: v.createdAt,
      stripe: {
        hasKey: Boolean(c?.stripeSecretEncrypted),
        testPassed: c?.stripeTestPassed ?? false,
      },
      paystack: {
        hasKey: Boolean(c?.paystackSecretEncrypted),
        testPassed: c?.paystackTestPassed ?? false,
      },
    };
  });

  res.json(enriched);
});

// ─── GET /admin/birthday-logs ─────────────────────────────────────────────────

router.get("/admin/birthday-logs", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const logs = await db
    .select()
    .from(birthdayMessageLogsTable)
    .orderBy(desc(birthdayMessageLogsTable.sentAt))
    .limit(200);

  res.json(logs);
});

export default router;
