/**
 * Per-vendor payment credential management.
 *
 * GET    /vendors/:id/payment-credentials        — masked keys + tier + test status
 * PUT    /vendors/:id/payment-credentials        — save a new key (encrypts + test-pings first)
 * DELETE /vendors/:id/payment-credentials        — wipe a key
 * POST   /vendors/:id/payment-credentials/test   — test a key without saving
 * PATCH  /vendors/:id/tier                       — admin: set subscriptionTier / verificationLevel
 */
import { Router } from "express";
import Stripe from "stripe";
import { db } from "@workspace/db";
import { vendorsTable, vendorPaymentCredentialsTable, adminAuditLogTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { encrypt, maskEncryptedKey } from "../lib/encryption";
import { canAddPaymentKeys } from "../lib/vendor-keys";
import { getAuth } from "@clerk/express";
import type { Vendor } from "@workspace/db/schema";

/** Returns true if the calling Clerk user is listed in ADMIN_USER_IDS env var. */
function isAdmin(userId: string): boolean {
  const ids = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(userId);
}

/**
 * Returns true if the Clerk user either owns the vendor (their clerkUserId
 * matches) or is a platform admin.
 */
function canManageVendor(userId: string, vendor: Vendor): boolean {
  return vendor.clerkUserId === userId || isAdmin(userId);
}

const router = Router();

const VALID_TIERS = ["free", "starter", "pro", "enterprise"];
const VALID_LEVELS = ["unverified", "basic", "verified", "premium"];
const PAYSTACK_BASE = "https://api.paystack.co";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function pingStripe(secretKey: string): Promise<void> {
  const stripe = new Stripe(secretKey);
  await stripe.balance.retrieve(); // throws if key is invalid / unauthorized
}

async function pingPaystack(secretKey: string): Promise<void> {
  const res = await fetch(`${PAYSTACK_BASE}/bank?perPage=1`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Paystack rejected the key (HTTP ${res.status})`);
  }
}

async function getVendorOr404(
  res: import("express").Response,
  id: number,
) {
  const [vendor] = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.id, id))
    .limit(1);
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return null;
  }
  return vendor;
}

// ─── GET /vendors/:id/payment-credentials ────────────────────────────────────

router.get("/vendors/:id/payment-credentials", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await getVendorOr404(res, id);
  if (!vendor) return;

  if (!canManageVendor(userId, vendor)) {
    res.status(403).json({ error: "You do not have permission to view this vendor's payment credentials" });
    return;
  }

  const [creds] = await db
    .select()
    .from(vendorPaymentCredentialsTable)
    .where(eq(vendorPaymentCredentialsTable.vendorId, id))
    .limit(1);

  const unlocked = canAddPaymentKeys(vendor);

  res.json({
    vendorId: id,
    subscriptionTier: vendor.subscriptionTier,
    verificationLevel: vendor.verificationLevel,
    featureUnlocked: unlocked,
    requiredTiers: ["pro", "enterprise"],
    requiredLevels: ["verified", "premium"],
    stripe: {
      hasKey: Boolean(creds?.stripeSecretEncrypted),
      maskedKey: maskEncryptedKey(creds?.stripeSecretEncrypted),
      testPassed: creds?.stripeTestPassed ?? false,
    },
    paystack: {
      hasKey: Boolean(creds?.paystackSecretEncrypted),
      maskedKey: maskEncryptedKey(creds?.paystackSecretEncrypted),
      testPassed: creds?.paystackTestPassed ?? false,
    },
  });
});

// ─── PUT /vendors/:id/payment-credentials ────────────────────────────────────

router.put("/vendors/:id/payment-credentials", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await getVendorOr404(res, id);
  if (!vendor) return;

  if (!canManageVendor(userId, vendor)) {
    res.status(403).json({ error: "You do not have permission to manage this vendor's payment credentials" });
    return;
  }

  if (!canAddPaymentKeys(vendor)) {
    res.status(403).json({
      error: "Your subscription tier or verification level does not allow adding your own payment keys.",
      currentTier: vendor.subscriptionTier,
      currentLevel: vendor.verificationLevel,
      requiredTiers: ["pro", "enterprise"],
      requiredLevels: ["verified", "premium"],
      upgradeMessage: "Upgrade to Pro/Enterprise or complete verification to unlock direct payment routing.",
    });
    return;
  }

  const { provider, secretKey } = req.body as {
    provider?: string;
    secretKey?: string;
  };

  if (!provider || !secretKey) {
    res.status(400).json({ error: "provider and secretKey are required" });
    return;
  }
  if (!["stripe", "paystack"].includes(provider)) {
    res.status(400).json({ error: "provider must be 'stripe' or 'paystack'" });
    return;
  }

  // Test the key before saving — reject immediately if invalid
  try {
    if (provider === "stripe") await pingStripe(secretKey);
    else await pingPaystack(secretKey);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(422).json({ error: `Key validation failed: ${msg}` });
    return;
  }

  const encrypted = encrypt(secretKey);

  // Upsert the credentials row
  const [existing] = await db
    .select()
    .from(vendorPaymentCredentialsTable)
    .where(eq(vendorPaymentCredentialsTable.vendorId, id))
    .limit(1);

  if (existing) {
    await db
      .update(vendorPaymentCredentialsTable)
      .set(
        provider === "stripe"
          ? { stripeSecretEncrypted: encrypted, stripeTestPassed: true, updatedAt: new Date() }
          : { paystackSecretEncrypted: encrypted, paystackTestPassed: true, updatedAt: new Date() },
      )
      .where(eq(vendorPaymentCredentialsTable.vendorId, id));
  } else {
    await db.insert(vendorPaymentCredentialsTable).values(
      provider === "stripe"
        ? { vendorId: id, stripeSecretEncrypted: encrypted, stripeTestPassed: true }
        : { vendorId: id, paystackSecretEncrypted: encrypted, paystackTestPassed: true },
    );
  }

  res.json({
    ok: true,
    provider,
    maskedKey: `...${secretKey.slice(-4)}`,
    testPassed: true,
  });
});

// ─── DELETE /vendors/:id/payment-credentials ─────────────────────────────────

router.delete("/vendors/:id/payment-credentials", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await getVendorOr404(res, id);
  if (!vendor) return;

  if (!canManageVendor(userId, vendor)) {
    res.status(403).json({ error: "You do not have permission to manage this vendor's payment credentials" });
    return;
  }

  const { provider } = req.body as { provider?: string };
  if (!provider || !["stripe", "paystack"].includes(provider)) {
    res.status(400).json({ error: "provider must be 'stripe' or 'paystack'" });
    return;
  }

  await db
    .update(vendorPaymentCredentialsTable)
    .set(
      provider === "stripe"
        ? { stripeSecretEncrypted: null, stripeTestPassed: false, updatedAt: new Date() }
        : { paystackSecretEncrypted: null, paystackTestPassed: false, updatedAt: new Date() },
    )
    .where(eq(vendorPaymentCredentialsTable.vendorId, id));

  res.json({ ok: true, provider, removed: true });
});

// ─── POST /vendors/:id/payment-credentials/test ──────────────────────────────

router.post("/vendors/:id/payment-credentials/test", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendor = await getVendorOr404(res, id);
  if (!vendor) return;

  if (!canManageVendor(userId, vendor)) {
    res.status(403).json({ error: "You do not have permission to test this vendor's payment credentials" });
    return;
  }

  if (!canAddPaymentKeys(vendor)) {
    res.status(403).json({ error: "Feature not available at your current tier/level." });
    return;
  }

  const { provider, secretKey } = req.body as { provider?: string; secretKey?: string };
  if (!provider || !secretKey) {
    res.status(400).json({ error: "provider and secretKey are required" });
    return;
  }

  try {
    if (provider === "stripe") await pingStripe(secretKey);
    else if (provider === "paystack") await pingPaystack(secretKey);
    else { res.status(400).json({ error: "provider must be 'stripe' or 'paystack'" }); return; }
    res.json({ ok: true, provider, testPassed: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(422).json({ ok: false, provider, testPassed: false, error: msg });
  }
});

// ─── PATCH /vendors/:id/tier ─────────────────────────────────────────────────

router.patch("/vendors/:id/tier", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid vendor id" }); return; }

  // Tier assignment is admin-only — vendors cannot self-upgrade
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) {
    res.status(403).json({
      error: "Admin access required to change subscription tier or verification level.",
      hint: "Add your Clerk user ID to the ADMIN_USER_IDS environment variable.",
    });
    return;
  }

  const { subscriptionTier, verificationLevel } = req.body as {
    subscriptionTier?: string;
    verificationLevel?: string;
  };

  if (subscriptionTier && !VALID_TIERS.includes(subscriptionTier)) {
    res.status(400).json({ error: `subscriptionTier must be one of: ${VALID_TIERS.join(", ")}` });
    return;
  }
  if (verificationLevel && !VALID_LEVELS.includes(verificationLevel)) {
    res.status(400).json({ error: `verificationLevel must be one of: ${VALID_LEVELS.join(", ")}` });
    return;
  }
  if (!subscriptionTier && !verificationLevel) {
    res.status(400).json({ error: "At least one of subscriptionTier or verificationLevel is required" });
    return;
  }

  // Execute the vendor update + audit log insert atomically.
  // If either step fails the entire transaction rolls back — no silent partial commits.
  const result = await db.transaction(async (tx) => {
    // Read old values inside the transaction for a consistent snapshot
    const [before] = await tx
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.id, id))
      .limit(1);
    if (!before) return null;

    const [vendor] = await tx
      .update(vendorsTable)
      .set({
        ...(subscriptionTier && { subscriptionTier }),
        ...(verificationLevel && { verificationLevel }),
        updatedAt: new Date(),
      })
      .where(eq(vendorsTable.id, id))
      .returning();

    if (!vendor) return null;

    // Write one audit row per field that actually changed
    const auditRows: { adminUserId: string; vendorId: number; field: string; oldValue: string; newValue: string }[] = [];
    if (subscriptionTier && subscriptionTier !== before.subscriptionTier) {
      auditRows.push({ adminUserId: userId, vendorId: id, field: "subscriptionTier", oldValue: before.subscriptionTier, newValue: subscriptionTier });
    }
    if (verificationLevel && verificationLevel !== before.verificationLevel) {
      auditRows.push({ adminUserId: userId, vendorId: id, field: "verificationLevel", oldValue: before.verificationLevel, newValue: verificationLevel });
    }
    if (auditRows.length > 0) {
      await tx.insert(adminAuditLogTable).values(auditRows);
    }

    return vendor;
  });

  if (!result) { res.status(404).json({ error: "Vendor not found" }); return; }

  res.json({
    id: result.id,
    subscriptionTier: result.subscriptionTier,
    verificationLevel: result.verificationLevel,
    featureUnlocked: canAddPaymentKeys(result),
  });
});

export default router;
