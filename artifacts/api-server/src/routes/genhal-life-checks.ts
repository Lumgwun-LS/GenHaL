/**
 * GenHaL Proof-of-Life check routes.
 *
 * Public:
 *   POST /genhal/life-check/verify      — family head submits their token to confirm alive
 *   GET  /genhal/life-check/verify/:tok — click link from email (auto-verify + redirect)
 *
 * Authenticated (family head):
 *   GET  /genhal/families/:id/life-checks  — history for their own family
 *
 * Admin:
 *   GET  /genhal/admin/life-checks         — all families' check history
 */
import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, genhalLifeChecksTable, genhalFamilyAccountsTable } from "@workspace/db";
import { requireAuth, getAuth } from "@clerk/express";
import { logger } from "../lib/logger";

const GENHAL_URL = "https://genhal.awajimaa.com";
const ADMIN_IDS = () =>
  (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export const genhalLifeChecksRouter = Router();

// ─── Public: verify by token (POST — form or API) ────────────────────────────
genhalLifeChecksRouter.post("/genhal/life-check/verify", async (req, res) => {
  const token = (req.body?.token ?? "").toString().trim().toUpperCase();
  if (!token) {
    res.status(400).json({ error: "token required" });
    return;
  }

  const [check] = await db
    .select()
    .from(genhalLifeChecksTable)
    .where(eq(genhalLifeChecksTable.token, token))
    .limit(1);

  if (!check) {
    res.status(404).json({ error: "Token not found. It may be invalid or already used." });
    return;
  }
  if (check.respondedAt) {
    res.json({ ok: true, alreadyVerified: true, respondedAt: check.respondedAt });
    return;
  }
  if (check.expiresAt < new Date()) {
    res.status(410).json({ error: "This token has expired. A new reminder will be sent at the next scheduled interval." });
    return;
  }

  await db
    .update(genhalLifeChecksTable)
    .set({ respondedAt: new Date() })
    .where(eq(genhalLifeChecksTable.id, check.id));

  logger.info({ familyId: check.familyId, token }, "[genhal-life-check] verified");
  res.json({ ok: true, familyId: check.familyId });
});

// ─── Public: verify by click link (GET — browser redirect) ───────────────────
genhalLifeChecksRouter.get("/genhal/life-check/verify/:token", async (req, res) => {
  const token = (req.params.token ?? "").toUpperCase();

  const [check] = await db
    .select()
    .from(genhalLifeChecksTable)
    .where(eq(genhalLifeChecksTable.token, token))
    .limit(1);

  if (!check) {
    res.redirect(`${GENHAL_URL}/verify?status=invalid&token=${encodeURIComponent(token)}`);
    return;
  }
  if (check.expiresAt < new Date()) {
    res.redirect(`${GENHAL_URL}/verify?status=expired`);
    return;
  }
  if (!check.respondedAt) {
    await db
      .update(genhalLifeChecksTable)
      .set({ respondedAt: new Date() })
      .where(eq(genhalLifeChecksTable.id, check.id));
    logger.info({ familyId: check.familyId, token }, "[genhal-life-check] verified via link");
  }

  // Redirect to the family profile so they can update it
  res.redirect(`${GENHAL_URL}/families/${check.familyId}?verified=1`);
});

// ─── Authenticated: family head views their own check history ─────────────────
genhalLifeChecksRouter.get(
  "/genhal/families/:familyId/life-checks",
  requireAuth(),
  async (req, res) => {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const familyId = Number(req.params.familyId);
    if (isNaN(familyId)) { res.status(400).json({ error: "Invalid familyId" }); return; }

    // Confirm caller is the family head (or an admin)
    const isAdmin = ADMIN_IDS().includes(userId);
    if (!isAdmin) {
      const [family] = await db
        .select({ clerkUserId: genhalFamilyAccountsTable.clerkUserId })
        .from(genhalFamilyAccountsTable)
        .where(eq(genhalFamilyAccountsTable.id, familyId))
        .limit(1);
      if (!family || family.clerkUserId !== userId) {
        res.status(403).json({ error: "Only the family head can view life-check history" });
        return;
      }
    }

    const checks = await db
      .select()
      .from(genhalLifeChecksTable)
      .where(eq(genhalLifeChecksTable.familyId, familyId))
      .orderBy(desc(genhalLifeChecksTable.sentAt));

    res.json({ checks: checks.map(serializeCheck) });
  },
);

// ─── Admin: all families' check history ──────────────────────────────────────
genhalLifeChecksRouter.get(
  "/genhal/admin/life-checks",
  requireAuth(),
  async (req, res) => {
    const { userId } = getAuth(req);
    if (!userId || !ADMIN_IDS().includes(userId)) {
      res.status(403).json({ error: "Admin only" });
      return;
    }

    const checks = await db
      .select({
        check: genhalLifeChecksTable,
        familyName: genhalFamilyAccountsTable.name,
        nokEmail: genhalFamilyAccountsTable.nextOfKinEmail,
      })
      .from(genhalLifeChecksTable)
      .leftJoin(
        genhalFamilyAccountsTable,
        eq(genhalLifeChecksTable.familyId, genhalFamilyAccountsTable.id),
      )
      .orderBy(desc(genhalLifeChecksTable.sentAt))
      .limit(500);

    res.json({
      checks: checks.map(({ check, familyName, nokEmail }) => ({
        ...serializeCheck(check),
        familyName,
        nokEmail,
      })),
    });
  },
);

function serializeCheck(c: typeof genhalLifeChecksTable.$inferSelect) {
  return {
    id:            c.id,
    familyId:      c.familyId,
    // Never return the raw token to the frontend — the head received it in email
    tokenHint:     `${c.token.slice(0, 2)}••••${c.token.slice(-2)}`,
    sentAt:        c.sentAt.toISOString(),
    respondedAt:   c.respondedAt?.toISOString() ?? null,
    expiresAt:     c.expiresAt.toISOString(),
    sequence:      c.sequence,
    nokNotifiedAt: c.nokNotifiedAt?.toISOString() ?? null,
    status:
      c.respondedAt           ? "verified"
      : c.expiresAt < new Date() ? "missed"
      : "pending",
  };
}
