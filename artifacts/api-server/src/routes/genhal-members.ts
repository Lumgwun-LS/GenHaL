/**
 * GenHaL — Kingdom & Family membership + RBAC
 */
import { Router } from "express";
import { sendFamilyWelcomeEmail } from "../lib/genhal-emails";
import { requireAuth, getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  genhalKingdomMembersTable,
  genhalFamilyMembersTable,
  genhalFamilyAccountsTable,
  genhalSubscriptionsTable,
  genhalKingdomsTable,
  GENHAL_PLANS,
} from "@workspace/db";
import { eq, and, asc, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

const KINGDOM_ROLE_RANK: Record<string, number> = {
  king: 9, queen_mother: 8, council_chief: 7, elder: 6,
  cdc_member: 5, family_head: 4, member: 2, viewer: 1, guest: 0,
};

async function requireKingdomRole(kingdomId: number, userId: string, minRank: number, res: any): Promise<string | false> {
  const [m] = await db.select().from(genhalKingdomMembersTable)
    .where(and(eq(genhalKingdomMembersTable.kingdomId, kingdomId), eq(genhalKingdomMembersTable.clerkUserId, userId), eq(genhalKingdomMembersTable.status, "active")));
  const rank = KINGDOM_ROLE_RANK[m?.role ?? "guest"] ?? 0;
  if (rank < minRank) { res.status(403).json({ error: "Insufficient kingdom role" }); return false; }
  return m?.role ?? "guest";
}

// ── Kingdom members ───────────────────────────────────────────────────────────

router.get("/genhal/kingdoms/:id/members", requireAuth(), async (req, res): Promise<void> => {
  const kingdomId = Number(req.params.id);
  const userId = getAuth(req).userId!;
  const role = await requireKingdomRole(kingdomId, userId, 1, res);
  if (role === false) return;
  try {
    const members = await db.select().from(genhalKingdomMembersTable)
      .where(eq(genhalKingdomMembersTable.kingdomId, kingdomId))
      .orderBy(desc(genhalKingdomMembersTable.joinedAt));
    res.json(members);
  } catch { res.status(500).json({ error: "Failed" }); }
});

// Self-join: any logged-in user can join as viewer/member
router.post("/genhal/kingdoms/:id/members/join", requireAuth(), async (req, res): Promise<void> => {
  const kingdomId = Number(req.params.id); const userId = getAuth(req).userId!;
  const { role = "member" } = req.body;
  // Only allow self-assignment to low roles
  const allowedSelfRoles = ["member", "viewer", "guest"];
  if (!allowedSelfRoles.includes(role)) return void res.status(403).json({ error: "Cannot self-assign that role" });
  try {
    const [existing] = await db.select().from(genhalKingdomMembersTable)
      .where(and(eq(genhalKingdomMembersTable.kingdomId, kingdomId), eq(genhalKingdomMembersTable.clerkUserId, userId)));
    if (existing) return void res.status(409).json({ error: "Already a member", member: existing });
    // Check member quota
    const [sub] = await db.select().from(genhalSubscriptionsTable).where(and(eq(genhalSubscriptionsTable.unitType, "kingdom"), eq(genhalSubscriptionsTable.unitId, kingdomId)));
    if (sub && sub.maxMembers > 0 && sub.memberCount >= sub.maxMembers) {
      return void res.status(402).json({ error: "Member limit reached. The kingdom admin must upgrade the plan." });
    }
    const [m] = await db.insert(genhalKingdomMembersTable).values({
      kingdomId, clerkUserId: userId, role, status: "pending",
    }).returning();
    if (sub) await db.update(genhalSubscriptionsTable).set({ memberCount: (sub.memberCount ?? 0) + 1, updatedAt: new Date() }).where(eq(genhalSubscriptionsTable.id, sub.id));
    res.status(201).json(m);
  } catch { res.status(500).json({ error: "Failed" }); }
});

// Admin invite / add member
router.post("/genhal/kingdoms/:id/members", requireAuth(), async (req, res): Promise<void> => {
  const kingdomId = Number(req.params.id); const userId = getAuth(req).userId!;
  const b = req.body;
  if (!b.clerkUserId) return void res.status(400).json({ error: "clerkUserId required" });
  const callerRole = await requireKingdomRole(kingdomId, userId, 7, res); // council_chief+
  if (callerRole === false) return;
  try {
    const [sub] = await db.select().from(genhalSubscriptionsTable).where(and(eq(genhalSubscriptionsTable.unitType, "kingdom"), eq(genhalSubscriptionsTable.unitId, kingdomId)));
    if (sub && sub.maxMembers > 0 && sub.memberCount >= sub.maxMembers) {
      return void res.status(402).json({ error: "Member limit reached. Upgrade the plan first." });
    }
    const [m] = await db.insert(genhalKingdomMembersTable).values({
      kingdomId, clerkUserId: b.clerkUserId, role: b.role ?? "member",
      customTitle: b.customTitle ?? null, status: b.status ?? "active",
      invitedByClerkUserId: userId, notes: b.notes ?? null,
      attributes: b.attributes ?? null,
    }).returning();
    if (sub) await db.update(genhalSubscriptionsTable).set({ memberCount: (sub.memberCount ?? 0) + 1, updatedAt: new Date() }).where(eq(genhalSubscriptionsTable.id, sub.id));
    res.status(201).json(m);
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed" }); }
});

// Update member role/status/title
router.patch("/genhal/kingdoms/:kingdomId/members/:memberId", requireAuth(), async (req, res): Promise<void> => {
  const kingdomId = Number(req.params.kingdomId); const userId = getAuth(req).userId!;
  const callerRole = await requireKingdomRole(kingdomId, userId, 7, res);
  if (callerRole === false) return;
  const b = req.body;
  try {
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const f of ["role","customTitle","status","notes","attributes"]) if (b[f] !== undefined) updates[f] = b[f];
    const [m] = await db.update(genhalKingdomMembersTable).set(updates).where(eq(genhalKingdomMembersTable.id, Number(req.params.memberId))).returning();
    res.json(m);
  } catch { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/kingdoms/:kingdomId/members/:memberId", requireAuth(), async (req, res): Promise<void> => {
  const kingdomId = Number(req.params.kingdomId); const userId = getAuth(req).userId!;
  const callerRole = await requireKingdomRole(kingdomId, userId, 7, res);
  if (callerRole === false) return;
  try {
    await db.delete(genhalKingdomMembersTable).where(eq(genhalKingdomMembersTable.id, Number(req.params.memberId)));
    const [sub] = await db.select().from(genhalSubscriptionsTable).where(and(eq(genhalSubscriptionsTable.unitType, "kingdom"), eq(genhalSubscriptionsTable.unitId, kingdomId)));
    if (sub) await db.update(genhalSubscriptionsTable).set({ memberCount: Math.max(0, (sub.memberCount ?? 1) - 1), updatedAt: new Date() }).where(eq(genhalSubscriptionsTable.id, sub.id));
    res.status(204).send();
  } catch { res.status(500).json({ error: "Failed" }); }
});

// ── Public: list families that opted in to public visibility ─────────────────

router.get("/genhal/public/families", async (_req, res): Promise<void> => {
  try {
    const { sql } = await import("drizzle-orm");
    const families = await db
      .select({
        id: genhalFamilyAccountsTable.id,
        name: genhalFamilyAccountsTable.name,
        localName: genhalFamilyAccountsTable.localName,
        country: genhalFamilyAccountsTable.country,
        region: genhalFamilyAccountsTable.region,
        coverImageUrl: genhalFamilyAccountsTable.coverImageUrl,
        memberCount: sql<number>`(
          SELECT COUNT(*) FROM genhal_family_members
          WHERE family_id = ${genhalFamilyAccountsTable.id} AND status = 'active'
        )`,
      })
      .from(genhalFamilyAccountsTable)
      .where(eq(genhalFamilyAccountsTable.isPublic, true))
      .orderBy(asc(genhalFamilyAccountsTable.name))
      .limit(60);
    res.json({ families });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Failed" });
  }
});

// ── Family accounts ───────────────────────────────────────────────────────────

router.get("/genhal/families", requireAuth(), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const { kingdomId } = req.query;
  try {
    // Return families user is head of, or all in a kingdom if admin
    const conds: any[] = [];
    if (kingdomId) conds.push(eq(genhalFamilyAccountsTable.kingdomId, Number(kingdomId)));
    const all = await db.select().from(genhalFamilyAccountsTable)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(genhalFamilyAccountsTable.name));
    // Filter to only families this user belongs to (unless it's their kingdom)
    const memberFamilyIds = (await db.select({ fid: genhalFamilyMembersTable.familyId })
      .from(genhalFamilyMembersTable).where(and(eq(genhalFamilyMembersTable.clerkUserId, userId), eq(genhalFamilyMembersTable.status, "active")))).map(r => r.fid);
    const ownFamilies = all.filter(f => f.clerkUserId === userId || memberFamilyIds.includes(f.id) || f.isPublic);
    res.json(ownFamilies);
  } catch { res.status(500).json({ error: "Failed" }); }
});

router.post("/genhal/families", requireAuth(), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!; const b = req.body;
  if (!b.name) return void res.status(400).json({ error: "name required" });
  try {
    const [family] = await db.insert(genhalFamilyAccountsTable).values({
      clerkUserId: userId, name: b.name, localName: b.localName ?? null,
      description: b.description ?? null, kingdomId: b.kingdomId ? Number(b.kingdomId) : null,
      compoundId: b.compoundId ? Number(b.compoundId) : null,
      country: b.country ?? null, region: b.region ?? null, district: b.district ?? null,
      attributes: b.attributes ?? null, isPublic: Boolean(b.isPublic),
    }).returning();
    // Auto-join as head
    await db.insert(genhalFamilyMembersTable).values({
      familyId: family.id, clerkUserId: userId, role: "head", status: "active",
    });
    // Create free subscription
    await db.insert(genhalSubscriptionsTable).values({
      unitType: "family", unitId: family.id, plan: "free",
      storageLimitBytes: GENHAL_PLANS.free.storageLimitBytes,
      maxMembers: GENHAL_PLANS.free.maxMembers,
      maxVaultDocuments: GENHAL_PLANS.free.maxVaultDocuments,
      createdByClerkUserId: userId,
    });
    res.status(201).json(family);
    // Best-effort welcome email — must not block the response
    sendFamilyWelcomeEmail({
      creatorClerkUserId: userId,
      familyName: family.name,
      familyId: family.id,
    }).catch(() => {});
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed" }); }
});

router.get("/genhal/families/:id", requireAuth(), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  try {
    const [family] = await db.select().from(genhalFamilyAccountsTable).where(eq(genhalFamilyAccountsTable.id, Number(req.params.id)));
    if (!family) return void res.status(404).json({ error: "Not found" });
    const members = await db.select().from(genhalFamilyMembersTable).where(eq(genhalFamilyMembersTable.familyId, family.id)).orderBy(asc(genhalFamilyMembersTable.joinedAt));
    const [sub] = await db.select().from(genhalSubscriptionsTable).where(and(eq(genhalSubscriptionsTable.unitType, "family"), eq(genhalSubscriptionsTable.unitId, family.id)));
    res.json({ ...family, members, subscription: sub ?? null });
  } catch { res.status(500).json({ error: "Failed" }); }
});

router.patch("/genhal/families/:id", requireAuth(), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!; const b = req.body;
  try {
    const [fam] = await db.select().from(genhalFamilyAccountsTable).where(eq(genhalFamilyAccountsTable.id, Number(req.params.id)));
    if (!fam || fam.clerkUserId !== userId) return void res.status(403).json({ error: "Access denied" });
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const f of ["name","localName","description","country","region","district","coverImageUrl","emblemImageUrl","attributes","isPublic"]) if (b[f] !== undefined) updates[f] = b[f];
    const [updated] = await db.update(genhalFamilyAccountsTable).set(updates).where(eq(genhalFamilyAccountsTable.id, fam.id)).returning();
    res.json(updated);
  } catch { res.status(500).json({ error: "Failed" }); }
});

// Family members
router.post("/genhal/families/:id/members", requireAuth(), async (req, res): Promise<void> => {
  const familyId = Number(req.params.id); const userId = getAuth(req).userId!; const b = req.body;
  if (!b.clerkUserId) return void res.status(400).json({ error: "clerkUserId required" });
  const [caller] = await db.select().from(genhalFamilyMembersTable)
    .where(and(eq(genhalFamilyMembersTable.familyId, familyId), eq(genhalFamilyMembersTable.clerkUserId, userId)));
  if (!caller || !["head","co_head"].includes(caller.role)) return void res.status(403).json({ error: "Only head or co-head can add members" });
  try {
    const [m] = await db.insert(genhalFamilyMembersTable).values({
      familyId, clerkUserId: b.clerkUserId, role: b.role ?? "member",
      relationship: b.relationship ?? null, customTitle: b.customTitle ?? null,
      status: b.status ?? "active", invitedByClerkUserId: userId,
      attributes: b.attributes ?? null,
    }).returning();
    res.status(201).json(m);
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed" }); }
});

router.patch("/genhal/families/:familyId/members/:memberId", requireAuth(), async (req, res): Promise<void> => {
  const familyId = Number(req.params.familyId); const userId = getAuth(req).userId!; const b = req.body;
  const [caller] = await db.select().from(genhalFamilyMembersTable)
    .where(and(eq(genhalFamilyMembersTable.familyId, familyId), eq(genhalFamilyMembersTable.clerkUserId, userId)));
  if (!caller || !["head","co_head"].includes(caller.role)) return void res.status(403).json({ error: "Access denied" });
  try {
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const f of ["role","relationship","customTitle","status","attributes"]) if (b[f] !== undefined) updates[f] = b[f];
    const [m] = await db.update(genhalFamilyMembersTable).set(updates).where(eq(genhalFamilyMembersTable.id, Number(req.params.memberId))).returning();
    res.json(m);
  } catch { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/families/:familyId/members/:memberId", requireAuth(), async (req, res): Promise<void> => {
  const familyId = Number(req.params.familyId); const userId = getAuth(req).userId!;
  const [caller] = await db.select().from(genhalFamilyMembersTable)
    .where(and(eq(genhalFamilyMembersTable.familyId, familyId), eq(genhalFamilyMembersTable.clerkUserId, userId)));
  if (!caller || !["head","co_head"].includes(caller.role)) return void res.status(403).json({ error: "Access denied" });
  try {
    await db.delete(genhalFamilyMembersTable).where(eq(genhalFamilyMembersTable.id, Number(req.params.memberId)));
    res.status(204).send();
  } catch { res.status(500).json({ error: "Failed" }); }
});

export default router;
