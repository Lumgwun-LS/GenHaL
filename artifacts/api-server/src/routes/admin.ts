/**
 * Admin-only endpoints.
 *
 * GET  /admin/check          — returns { isAdmin: boolean } for the current user
 * GET  /admin/vendors        — all vendors enriched with payment-credential status
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { vendorsTable, vendorPaymentCredentialsTable, birthdayMessageLogsTable, voiceCallLogsTable, adminAuditLogTable, adminExportLogsTable } from "@workspace/db/schema";
import { eq, desc, and, gte, lte, gt, asc, inArray, type SQL } from "drizzle-orm";
import { isTwilioConfigured } from "../lib/voice-caller";
import { canAddPaymentKeys } from "../lib/vendor-keys";
import { getSiteContent, setSiteContentBlock, validateSiteContentBlock, SITE_CONTENT_KEYS, type SiteContentKey } from "../lib/site-content";
import { ZodError } from "zod";

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

  const { tier, status, verificationLevel, joinedAfter, joinedBefore } = req.query as {
    tier?: string;
    status?: string;
    verificationLevel?: string;
    joinedAfter?: string;
    joinedBefore?: string;
  };

  const conditions: SQL[] = [];
  if (tier) conditions.push(eq(vendorsTable.subscriptionTier, tier));
  if (status) conditions.push(eq(vendorsTable.status, status));
  if (verificationLevel) conditions.push(eq(vendorsTable.verificationLevel, verificationLevel));
  if (joinedAfter) {
    const d = new Date(joinedAfter);
    if (!isNaN(d.getTime())) conditions.push(gte(vendorsTable.createdAt, d));
  }
  if (joinedBefore) {
    const d = new Date(joinedBefore);
    if (!isNaN(d.getTime())) {
      // Include the entire selected day by treating it as an inclusive end-of-day bound.
      const endOfDay = new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1);
      conditions.push(lte(vendorsTable.createdAt, endOfDay));
    }
  }

  const HEADERS = [
    "ID", "Name", "Industry", "Status", "Email", "Phone", "Website",
    "Address", "Subscription Tier", "Verification Level",
    "Payment Keys Connected",
    "Stripe Enabled", "Paystack Enabled", "Default Currency",
    "Voice Call Opt-Out", "Date of Birth", "Created At", "Updated At",
  ];

  function csvCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const filename = `vendors-export-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  res.write(HEADERS.join(",") + "\r\n");

  // Stream vendors in fixed-size batches ordered by a stable, indexed key (id)
  // so memory usage stays constant regardless of table size — no matter how
  // many thousands of vendors match the filters, we only ever hold one batch
  // (plus its payment-credential lookups) in memory at a time.
  const BATCH_SIZE = 500;
  let lastId = 0;
  let totalRows = 0;

  while (true) {
    const batchConditions = [...conditions, gt(vendorsTable.id, lastId)];
    const batch = await db
      .select()
      .from(vendorsTable)
      .where(and(...batchConditions))
      .orderBy(asc(vendorsTable.id))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    const batchIds = batch.map((v) => v.id);
    const creds = await db
      .select()
      .from(vendorPaymentCredentialsTable)
      .where(inArray(vendorPaymentCredentialsTable.vendorId, batchIds));
    const credsByVendor = new Map(creds.map((c) => [c.vendorId, c]));

    let chunk = "";
    for (const v of batch) {
      const c = credsByVendor.get(v.id);
      const keysConnected: string[] = [];
      if (c?.stripeSecretEncrypted) keysConnected.push("Stripe");
      if (c?.paystackSecretEncrypted) keysConnected.push("Paystack");

      const row = [
        v.id, v.name, v.industry, v.status, v.email ?? "",
        v.phone ?? "", v.website ?? "", v.address ?? "",
        v.subscriptionTier, v.verificationLevel,
        keysConnected.join("; "),
        v.stripeEnabled, v.paystackEnabled, v.defaultCurrency ?? "",
        v.voiceCallOptOut, v.dateOfBirth ?? "", v.createdAt, v.updatedAt,
      ].map(csvCell).join(",");
      chunk += row + "\r\n";
    }
    res.write(chunk);

    totalRows += batch.length;
    lastId = batch[batch.length - 1]!.id;
    if (batch.length < BATCH_SIZE) break;
  }

  res.end();

  await db.insert(adminExportLogsTable).values({
    adminUserId: userId,
    filters: JSON.stringify({ tier, status, verificationLevel, joinedAfter, joinedBefore }),
    rowCount: totalRows,
  });
});

// ─── GET /admin/export-logs ────────────────────────────────────────────────────

router.get("/admin/export-logs", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const logs = await db
    .select()
    .from(adminExportLogsTable)
    .orderBy(desc(adminExportLogsTable.exportedAt))
    .limit(50);

  res.json(logs);
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

// ─── GET /admin/audit-log ─────────────────────────────────────────────────────

router.get("/admin/audit-log", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const entries = await db
    .select({
      id: adminAuditLogTable.id,
      adminUserId: adminAuditLogTable.adminUserId,
      adminDisplayName: adminAuditLogTable.adminDisplayName,
      vendorId: adminAuditLogTable.vendorId,
      vendorName: vendorsTable.name,
      field: adminAuditLogTable.field,
      oldValue: adminAuditLogTable.oldValue,
      newValue: adminAuditLogTable.newValue,
      changedAt: adminAuditLogTable.changedAt,
    })
    .from(adminAuditLogTable)
    .leftJoin(vendorsTable, eq(adminAuditLogTable.vendorId, vendorsTable.id))
    .orderBy(desc(adminAuditLogTable.changedAt))
    .limit(50);

  res.json(entries);
});

// ─── GET /admin/site-content ─────────────────────────────────────────────────

router.get("/admin/site-content", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const content = await getSiteContent();
  res.json(content);
});

// ─── PATCH /admin/site-content/:key ───────────────────────────────────────────

router.patch("/admin/site-content/:key", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }

  const key = req.params.key as SiteContentKey;
  if (!SITE_CONTENT_KEYS.includes(key)) {
    res.status(400).json({ error: `Unknown content key "${key}".` });
    return;
  }

  const { value } = req.body as { value?: unknown };
  if (value === undefined || value === null || typeof value !== "object") {
    res.status(400).json({ error: "Body must include a `value` object." });
    return;
  }

  let validated: unknown;
  try {
    validated = validateSiteContentBlock(key, value);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: "Invalid content shape.", details: err.issues });
      return;
    }
    throw err;
  }

  await setSiteContentBlock(key, validated, userId);
  res.json({ success: true });
});

// ─── GET /admin/voice-status ──────────────────────────────────────────────────

router.get("/admin/voice-status", (req, res): void => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin access required." }); return; }
  res.json({ configured: isTwilioConfigured() });
});

export default router;
