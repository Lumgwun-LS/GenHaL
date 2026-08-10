/**
 * GenHaL Kingdoms — full civic governance layer
 * Kingdom → (Rulers, Council of Chiefs, CDC, Compounds, Towns, Villages, Records)
 */
import { Router } from "express";
import { sendKingdomWelcomeEmail } from "../lib/genhal-emails";
import { requireAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  genhalKingdomsTable,
  genhalKingdomRulersTable,
  genhalTownsTable,
  genhalVillagesTable,
  genhalCompoundsTable,
  genhalCompoundChiefsTable,
  genhalCouncilMembersTable,
  genhalCdcCommitteesTable,
  genhalCdcMembersTable,
  genhalCivicRecordsTable,
} from "@workspace/db";
import { eq, desc, and, asc, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ─── Kingdoms CRUD ────────────────────────────────────────────────────────────

router.get("/genhal/kingdoms", requireAuth(), async (_req, res) => {
  try {
    const rows = await db.select().from(genhalKingdomsTable).orderBy(asc(genhalKingdomsTable.name));
    res.json(rows);
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed" }); }
});

router.post("/genhal/kingdoms", requireAuth(), async (req, res) => {
  const userId = req.auth?.userId;
  const b = req.body;
  if (!b.name) return res.status(400).json({ error: "name required" });
  try {
    const [row] = await db.insert(genhalKingdomsTable).values({
      clerkUserId: userId!, name: b.name, localName: b.localName ?? null,
      unitType: b.unitType ?? "kingdom", unitTypeLabel: b.unitTypeLabel ?? null,
      languageCode: b.languageCode ?? null,
      communityId: b.communityId ? Number(b.communityId) : null,
      country: b.country ?? null, region: b.region ?? null, district: b.district ?? null,
      latitude: b.latitude ? parseFloat(b.latitude) : null,
      longitude: b.longitude ? parseFloat(b.longitude) : null,
      foundedYear: b.foundedYear ? Number(b.foundedYear) : null,
      description: b.description ?? null, coverImageUrl: b.coverImageUrl ?? null,
      emblemImageUrl: b.emblemImageUrl ?? null, rulerTitle: b.rulerTitle ?? "King",
    }).returning();
    res.status(201).json(row);
    // Best-effort welcome email — must not block the response
    sendKingdomWelcomeEmail({
      creatorClerkUserId: userId!,
      kingdomName: row.name,
      kingdomId: row.id,
      rulerTitle: row.rulerTitle ?? "King",
    }).catch(() => {});
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed" }); }
});

// Full kingdom detail — all sub-entities in one call
router.get("/genhal/kingdoms/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [kingdom] = await db.select().from(genhalKingdomsTable).where(eq(genhalKingdomsTable.id, id));
    if (!kingdom) return res.status(404).json({ error: "Not found" });

    const [rulers, towns, villages, compounds, council, cdcCommittees, records] = await Promise.all([
      db.select().from(genhalKingdomRulersTable).where(eq(genhalKingdomRulersTable.kingdomId, id)).orderBy(asc(genhalKingdomRulersTable.reignStart)),
      db.select().from(genhalTownsTable).where(eq(genhalTownsTable.kingdomId, id)).orderBy(asc(genhalTownsTable.name)),
      db.select().from(genhalVillagesTable).where(eq(genhalVillagesTable.kingdomId, id)).orderBy(asc(genhalVillagesTable.name)),
      db.select().from(genhalCompoundsTable).where(eq(genhalCompoundsTable.kingdomId, id)).orderBy(asc(genhalCompoundsTable.name)),
      db.select().from(genhalCouncilMembersTable).where(eq(genhalCouncilMembersTable.kingdomId, id)).orderBy(asc(genhalCouncilMembersTable.role)),
      db.select().from(genhalCdcCommitteesTable).where(eq(genhalCdcCommitteesTable.kingdomId, id)).orderBy(desc(genhalCdcCommitteesTable.termStart)),
      db.select().from(genhalCivicRecordsTable).where(eq(genhalCivicRecordsTable.kingdomId, id)).orderBy(asc(genhalCivicRecordsTable.sortOrder)),
    ]);

    // Attach chiefs to each compound
    const compoundIds = compounds.map(c => c.id);
    const allChiefs = compoundIds.length
      ? await db.select().from(genhalCompoundChiefsTable)
          .where(inArray(genhalCompoundChiefsTable.compoundId, compoundIds))
          .orderBy(asc(genhalCompoundChiefsTable.reignStart))
      : [];
    const compoundsWithChiefs = compounds.map(c => ({
      ...c, chiefs: allChiefs.filter(ch => ch.compoundId === c.id),
    }));

    // Attach villages to towns + collect direct-under-kingdom villages
    const townsWithVillages = towns.map(t => ({
      ...t, villages: villages.filter(v => v.townId === t.id),
    }));
    const directVillages = villages.filter(v => !v.townId);

    // Attach members to CDC committees
    const committeeIds = cdcCommittees.map(c => c.id);
    const allCdcMembers = committeeIds.length
      ? await db.select().from(genhalCdcMembersTable)
          .where(inArray(genhalCdcMembersTable.committeeId, committeeIds))
          .orderBy(asc(genhalCdcMembersTable.role))
      : [];
    const cdcWithMembers = cdcCommittees.map(c => ({
      ...c, members: allCdcMembers.filter(m => m.committeeId === c.id),
    }));

    res.json({ ...kingdom, rulers, towns: townsWithVillages, directVillages, compounds: compoundsWithChiefs, council, cdc: cdcWithMembers, records });
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed" }); }
});

router.patch("/genhal/kingdoms/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id); const b = req.body;
  try {
    const fields = ["name","localName","unitType","unitTypeLabel","languageCode","communityId","country","region","district","latitude","longitude","foundedYear","description","coverImageUrl","emblemImageUrl","rulerTitle"];
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const f of fields) if (b[f] !== undefined) updates[f] = b[f];
    const [row] = await db.update(genhalKingdomsTable).set(updates).where(eq(genhalKingdomsTable.id, id)).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/kingdoms/:id", requireAuth(), async (req, res) => {
  try {
    await db.delete(genhalKingdomsTable).where(eq(genhalKingdomsTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ─── Rulers ───────────────────────────────────────────────────────────────────

router.post("/genhal/kingdoms/:id/rulers", requireAuth(), async (req, res) => {
  const kingdomId = Number(req.params.id); const b = req.body;
  if (!b.name || !b.title) return res.status(400).json({ error: "name and title required" });
  try {
    if (b.isCurrent) await db.update(genhalKingdomRulersTable).set({ isCurrent: false }).where(and(eq(genhalKingdomRulersTable.kingdomId, kingdomId), eq(genhalKingdomRulersTable.isCurrent, true)));
    const [row] = await db.insert(genhalKingdomRulersTable).values({
      kingdomId, name: b.name, localName: b.localName ?? null, title: b.title,
      reignStart: b.reignStart ? Number(b.reignStart) : null, reignEnd: b.reignEnd ? Number(b.reignEnd) : null,
      isCurrent: Boolean(b.isCurrent), bio: b.bio ?? null, achievements: b.achievements ?? null,
      imageUrl: b.imageUrl ?? null, treeId: b.treeId ? Number(b.treeId) : null,
      memberId: b.memberId ? Number(b.memberId) : null, successionNotes: b.successionNotes ?? null,
    }).returning();
    res.status(201).json(row);
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed" }); }
});

router.patch("/genhal/kingdoms/:kingdomId/rulers/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id); const b = req.body;
  try {
    if (b.isCurrent) await db.update(genhalKingdomRulersTable).set({ isCurrent: false }).where(and(eq(genhalKingdomRulersTable.kingdomId, Number(req.params.kingdomId)), eq(genhalKingdomRulersTable.isCurrent, true)));
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const f of ["name","localName","title","reignStart","reignEnd","isCurrent","bio","achievements","imageUrl","successionNotes"]) if (b[f] !== undefined) updates[f] = b[f];
    const [row] = await db.update(genhalKingdomRulersTable).set(updates).where(eq(genhalKingdomRulersTable.id, id)).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/kingdoms/:kingdomId/rulers/:id", requireAuth(), async (req, res) => {
  try { await db.delete(genhalKingdomRulersTable).where(eq(genhalKingdomRulersTable.id, Number(req.params.id))); res.status(204).send(); }
  catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ─── Towns ────────────────────────────────────────────────────────────────────

router.post("/genhal/kingdoms/:id/towns", requireAuth(), async (req, res) => {
  const kingdomId = Number(req.params.id); const b = req.body; const userId = req.auth?.userId;
  if (!b.name) return res.status(400).json({ error: "name required" });
  try {
    const [row] = await db.insert(genhalTownsTable).values({ kingdomId, clerkUserId: userId!, name: b.name, localName: b.localName ?? null, description: b.description ?? null }).returning();
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/kingdoms/:kingdomId/towns/:id", requireAuth(), async (req, res) => {
  try { await db.delete(genhalTownsTable).where(eq(genhalTownsTable.id, Number(req.params.id))); res.status(204).send(); }
  catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ─── Villages ─────────────────────────────────────────────────────────────────

router.post("/genhal/kingdoms/:id/villages", requireAuth(), async (req, res) => {
  const kingdomId = Number(req.params.id); const b = req.body; const userId = req.auth?.userId;
  if (!b.name) return res.status(400).json({ error: "name required" });
  try {
    const [row] = await db.insert(genhalVillagesTable).values({
      kingdomId, clerkUserId: userId!, name: b.name, localName: b.localName ?? null,
      townId: b.townId ? Number(b.townId) : null, description: b.description ?? null,
    }).returning();
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/kingdoms/:kingdomId/villages/:id", requireAuth(), async (req, res) => {
  try { await db.delete(genhalVillagesTable).where(eq(genhalVillagesTable.id, Number(req.params.id))); res.status(204).send(); }
  catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ─── Compounds + Chiefs ───────────────────────────────────────────────────────

router.post("/genhal/kingdoms/:id/compounds", requireAuth(), async (req, res) => {
  const kingdomId = Number(req.params.id); const b = req.body;
  if (!b.name) return res.status(400).json({ error: "name required" });
  try {
    const [row] = await db.insert(genhalCompoundsTable).values({ kingdomId, name: b.name, localName: b.localName ?? null, description: b.description ?? null, chiefTitle: b.chiefTitle ?? "Chief" }).returning();
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/kingdoms/:kingdomId/compounds/:id", requireAuth(), async (req, res) => {
  try { await db.delete(genhalCompoundsTable).where(eq(genhalCompoundsTable.id, Number(req.params.id))); res.status(204).send(); }
  catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.post("/genhal/kingdoms/:kingdomId/compounds/:compoundId/chiefs", requireAuth(), async (req, res) => {
  const compoundId = Number(req.params.compoundId); const b = req.body;
  if (!b.name || !b.title) return res.status(400).json({ error: "name and title required" });
  try {
    if (b.isCurrent) await db.update(genhalCompoundChiefsTable).set({ isCurrent: false }).where(and(eq(genhalCompoundChiefsTable.compoundId, compoundId), eq(genhalCompoundChiefsTable.isCurrent, true)));
    const [row] = await db.insert(genhalCompoundChiefsTable).values({
      compoundId, name: b.name, localName: b.localName ?? null, title: b.title,
      reignStart: b.reignStart ? Number(b.reignStart) : null, reignEnd: b.reignEnd ? Number(b.reignEnd) : null,
      isCurrent: Boolean(b.isCurrent), bio: b.bio ?? null, imageUrl: b.imageUrl ?? null, successionNotes: b.successionNotes ?? null,
    }).returning();
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/kingdoms/:kId/compounds/:cId/chiefs/:id", requireAuth(), async (req, res) => {
  try { await db.delete(genhalCompoundChiefsTable).where(eq(genhalCompoundChiefsTable.id, Number(req.params.id))); res.status(204).send(); }
  catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ─── Council of Chiefs ────────────────────────────────────────────────────────

router.post("/genhal/kingdoms/:id/council", requireAuth(), async (req, res) => {
  const kingdomId = Number(req.params.id); const b = req.body;
  if (!b.name || !b.title) return res.status(400).json({ error: "name and title required" });
  try {
    if (b.isCurrent && b.role === "Chairman") {
      await db.update(genhalCouncilMembersTable).set({ isCurrent: false })
        .where(and(eq(genhalCouncilMembersTable.kingdomId, kingdomId), eq(genhalCouncilMembersTable.role, "Chairman"), eq(genhalCouncilMembersTable.isCurrent, true)));
    }
    const [row] = await db.insert(genhalCouncilMembersTable).values({
      kingdomId, chiefId: b.chiefId ? Number(b.chiefId) : null, compoundId: b.compoundId ? Number(b.compoundId) : null,
      name: b.name, title: b.title, role: b.role ?? "Member",
      joinedYear: b.joinedYear ? Number(b.joinedYear) : null, leftYear: b.leftYear ? Number(b.leftYear) : null,
      isCurrent: Boolean(b.isCurrent), imageUrl: b.imageUrl ?? null,
    }).returning();
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.patch("/genhal/kingdoms/:kingdomId/council/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id); const b = req.body;
  try {
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const f of ["name","title","role","joinedYear","leftYear","isCurrent","imageUrl","compoundId"]) if (b[f] !== undefined) updates[f] = b[f];
    const [row] = await db.update(genhalCouncilMembersTable).set(updates).where(eq(genhalCouncilMembersTable.id, id)).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/kingdoms/:kingdomId/council/:id", requireAuth(), async (req, res) => {
  try { await db.delete(genhalCouncilMembersTable).where(eq(genhalCouncilMembersTable.id, Number(req.params.id))); res.status(204).send(); }
  catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ─── CDC Committees + Members ─────────────────────────────────────────────────

router.post("/genhal/kingdoms/:id/cdc", requireAuth(), async (req, res) => {
  const kingdomId = Number(req.params.id); const b = req.body;
  if (!b.unitType || !b.unitId) return res.status(400).json({ error: "unitType and unitId required" });
  try {
    if (b.isCurrent) {
      await db.update(genhalCdcCommitteesTable).set({ isCurrent: false })
        .where(and(eq(genhalCdcCommitteesTable.kingdomId, kingdomId), eq(genhalCdcCommitteesTable.unitType, b.unitType), eq(genhalCdcCommitteesTable.unitId, Number(b.unitId)), eq(genhalCdcCommitteesTable.isCurrent, true)));
    }
    const [row] = await db.insert(genhalCdcCommitteesTable).values({
      kingdomId, unitType: b.unitType, unitId: Number(b.unitId),
      name: b.name ?? "Community Development Committee",
      termStart: b.termStart ? Number(b.termStart) : null, termEnd: b.termEnd ? Number(b.termEnd) : null,
      isCurrent: Boolean(b.isCurrent), mandate: b.mandate ?? null,
    }).returning();
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.post("/genhal/kingdoms/:kingdomId/cdc/:committeeId/members", requireAuth(), async (req, res) => {
  const committeeId = Number(req.params.committeeId); const b = req.body;
  if (!b.name) return res.status(400).json({ error: "name required" });
  try {
    const [row] = await db.insert(genhalCdcMembersTable).values({
      committeeId, name: b.name, localName: b.localName ?? null, role: b.role ?? "Member",
      electedYear: b.electedYear ? Number(b.electedYear) : null, bio: b.bio ?? null, imageUrl: b.imageUrl ?? null,
    }).returning();
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/kingdoms/:kId/cdc/:committeeId", requireAuth(), async (req, res) => {
  try { await db.delete(genhalCdcCommitteesTable).where(eq(genhalCdcCommitteesTable.id, Number(req.params.committeeId))); res.status(204).send(); }
  catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/kingdoms/:kId/cdc/:cId/members/:id", requireAuth(), async (req, res) => {
  try { await db.delete(genhalCdcMembersTable).where(eq(genhalCdcMembersTable.id, Number(req.params.id))); res.status(204).send(); }
  catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ─── Civic Records ────────────────────────────────────────────────────────────

router.get("/genhal/kingdoms/:id/records", requireAuth(), async (req, res) => {
  const { type, unitType } = req.query;
  try {
    const conds: any[] = [eq(genhalCivicRecordsTable.kingdomId, Number(req.params.id))];
    if (type) conds.push(eq(genhalCivicRecordsTable.type, type as string));
    if (unitType) conds.push(eq(genhalCivicRecordsTable.unitType, unitType as string));
    const rows = await db.select().from(genhalCivicRecordsTable).where(and(...conds)).orderBy(asc(genhalCivicRecordsTable.sortOrder));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.post("/genhal/kingdoms/:id/records", requireAuth(), async (req, res) => {
  const kingdomId = Number(req.params.id); const b = req.body;
  if (!b.type || !b.title) return res.status(400).json({ error: "type and title required" });
  try {
    const [row] = await db.insert(genhalCivicRecordsTable).values({
      kingdomId, unitType: b.unitType ?? "kingdom", unitId: b.unitId ? Number(b.unitId) : null,
      type: b.type, title: b.title, content: b.content ?? null, period: b.period ?? null,
      imageUrl: b.imageUrl ?? null, mediaUrls: b.mediaUrls ?? [], tags: b.tags ?? [],
      sortOrder: b.sortOrder ? Number(b.sortOrder) : 0,
    }).returning();
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.patch("/genhal/kingdoms/:kingdomId/records/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id); const b = req.body;
  try {
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const f of ["type","title","content","period","imageUrl","tags","sortOrder"]) if (b[f] !== undefined) updates[f] = b[f];
    const [row] = await db.update(genhalCivicRecordsTable).set(updates).where(eq(genhalCivicRecordsTable.id, id)).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/kingdoms/:kingdomId/records/:id", requireAuth(), async (req, res) => {
  try { await db.delete(genhalCivicRecordsTable).where(eq(genhalCivicRecordsTable.id, Number(req.params.id))); res.status(204).send(); }
  catch (err) { res.status(500).json({ error: "Failed" }); }
});

export default router;
