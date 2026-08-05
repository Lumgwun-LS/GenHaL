/**
 * ONE-TIME admin vendor seed — creates vendor rows for remaining super-admins.
 * GET /api/admin/admin-seed?token=awa-admin-seed-2026-Rz3vNpW8
 * Safe to call multiple times (ON CONFLICT DO NOTHING). Remove after first use.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema";

const router = Router();
const SEED_TOKEN = "awa-admin-seed-2026-Rz3vNpW8";

const ADMINS = [
  { clerkUserId: "user_3GLE3QNDHfRbB4aHdQPXmzZycH2", email: "lumgwuns@gmail.com",          name: "Awajimaa Admin" },
  { clerkUserId: "user_3Gpyx7zWh5b1RfEyVkjRsvFeZls", email: "lumgwunsolutions@gmail.com",  name: "Awajimaa Admin" },
];

router.get("/admin/admin-seed", async (req, res) => {
  if (req.query.token !== SEED_TOKEN) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const results: string[] = [];
  try {
    for (const admin of ADMINS) {
      const row = await db
        .insert(vendorsTable as any)
        .values({ clerkUserId: admin.clerkUserId, name: admin.name, email: admin.email, industry: "Technology", subscriptionTier: "premium" })
        .onConflictDoNothing()
        .returning();
      results.push(row.length ? `✓ Created vendor for ${admin.email}` : `· Already exists: ${admin.email}`);
    }
    res.json({ ok: true, results });
  } catch (err: any) {
    res.status(500).json({ error: err.message, results });
  }
});

export default router;
