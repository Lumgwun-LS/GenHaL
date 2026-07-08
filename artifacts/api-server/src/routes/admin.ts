/**
 * Admin-only endpoints.
 *
 * GET  /admin/check          — returns { isAdmin: boolean } for the current user
 * GET  /admin/vendors        — all vendors enriched with payment-credential status
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { vendorsTable, vendorPaymentCredentialsTable, birthdayMessageLogsTable, voiceCallLogsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { isTwilioConfigured } from "../lib/voice-caller";
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

// ─── GET /admin/vendors/export ────────────────────────────────────────────────

router.get("/admin/vendors/export", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const vendors = await db.select().from(vendorsTable).orderBy(vendorsTable.name);

  const HEADERS = [
    "ID", "Name", "Industry", "Status", "Email", "Phone", "Website",
    "Address", "Subscription Tier", "Verification Level",
    "Stripe Enabled", "Paystack Enabled", "Default Currency",
    "Voice Call Opt-Out", "Date of Birth", "Created At", "Updated At",
  ];

  function csvCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    // Wrap in quotes if the value contains a comma, quote, or newline
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const rows = vendors.map((v) => [
    v.id, v.name, v.industry, v.status, v.email ?? "",
    v.phone ?? "", v.website ?? "", v.address ?? "",
    v.subscriptionTier, v.verificationLevel,
    v.stripeEnabled, v.paystackEnabled, v.defaultCurrency ?? "",
    v.voiceCallOptOut, v.dateOfBirth ?? "", v.createdAt, v.updatedAt,
  ].map(csvCell).join(","));

  const csv = [HEADERS.join(","), ...rows].join("\r\n");
  const filename = `vendors-export-${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
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

// ─── GET /admin/voice-call-logs ───────────────────────────────────────────────

router.get("/admin/voice-call-logs", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const logs = await db
    .select()
    .from(voiceCallLogsTable)
    .orderBy(desc(voiceCallLogsTable.initiatedAt))
    .limit(300);

  res.json(logs);
});

// ─── GET /admin/voice-status ──────────────────────────────────────────────────

router.get("/admin/voice-status", (req, res): void => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }
  res.json({ configured: isTwilioConfigured() });
});

export default router;
