/**
 * GenHaL Towns — civic governance layer
 * Towns → Rulers (kings) · Compounds → Chiefs · Town Records (history, traditions, etc.)
 */
import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  genhalTownsTable,
  genhalTownRulersTable,
  genhalCompoundsTable,
  genhalCompoundChiefsTable,
  genhalTownRecordsTable,
} from "@workspace/db";
import { eq, desc, and, asc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ─── Towns ────────────────────────────────────────────────────────────────────

router.get("/genhal/towns", requireAuth(), async (_req, res) => {
  try {
    const rows = await db.select().from(genhalTownsTable).orderBy(asc(genhalTownsTable.name));
    res.json(rows);
  } catch (err) { logger.error(err, "towns GET"); res.status(500).json({ error: "Failed" }); }
});

router.post("/genhal/towns", requireAuth(), async (req, res) => {
  const userId = req.auth?.userId;
  const b = req.body;
  if (!b.name) return res.status(400).json({ error: "name required" });
  try {
    const [row] = await db.insert(genhalTownsTable).values({
      clerkUserId: userId!, name: b.name, localName: b.localName ?? null,
      languageCode: b.languageCode ?? null, communityId: b.communityId ? Number(b.communityId) : null,
      country: b.country ?? null, region: b.region ?? null, district: b.district ?? null,
      latitude: b.latitude ? parseFloat(b.latitude) : null,
      longitude: b.longitude ? parseFloat(b.longitude) : null,
      foundedYear: b.foundedYear ? Number(b.foundedYear) : null,
      description: b.description ?? null, coverImageUrl: b.coverImageUrl ?? null,
      emblemImageUrl: b.emblemImageUrl ?? null,
      rulerTitle: b.rulerTitle ?? "King", chiefTitle: b.chiefTitle ?? "Chief",
    }).returning();
    res.status(201).json(row);
  } catch (err) { logger.error(err, "towns POST"); res.status(500).json({ error: "Failed" }); }
});

router.get("/genhal/towns/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [town]     = await db.select().from(genhalTownsTable).where(eq(genhalTownsTable.id, id));
    if (!town) return res.status(404).json({ error: "Not found" });
    const rulers     = await db.select().from(genhalTownRulersTable).where(eq(genhalTownRulersTable.townId, id)).orderBy(asc(genhalTownRulersTable.reignStart));
    const compounds  = await db.select().from(genhalCompoundsTable).where(eq(genhalCompoundsTable.townId, id)).orderBy(asc(genhalCompoundsTable.name));
    const records    = await db.select().from(genhalTownRecordsTable).where(eq(genhalTownRecordsTable.townId, id)).orderBy(asc(genhalTownRecordsTable.sortOrder), asc(genhalTownRecordsTable.createdAt));
    // chiefs for each compound
    const compoundIds = compounds.map(c => c.id);
    const allChiefs = compoundIds.length
      ? await db.select().from(genhalCompoundChiefsTable)
          .where(eq(genhalCompoundChiefsTable.compoundId, compoundIds[0])) // fetched per compound below
          .then(() => Promise.all(compoundIds.map(cid =>
            db.select().from(genhalCompoundChiefsTable)
              .where(eq(genhalCompoundChiefsTable.compoundId, cid))
              .orderBy(asc(genhalCompoundChiefsTable.reignStart))
          )))
      : [];
    const compoundsWithChiefs = compounds.map((c, i) => ({ ...c, chiefs: allChiefs[i] ?? [] }));
    res.json({ ...town, rulers, compounds: compoundsWithChiefs, records });
  } catch (err) { logger.error(err, "towns/:id GET"); res.status(500).json({ error: "Failed" }); }
});

router.patch("/genhal/towns/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body;
  try {
    const updates: Record<string, any> = { updatedAt: new Date() };
    const fields = ["name","localName","languageCode","communityId","country","region","district",
      "foundedYear","description","coverImageUrl","emblemImageUrl","rulerTitle","chiefTitle","latitude","longitude"];
    for (const f of fields) if (b[f] !== undefined) updates[f] = b[f];
    const [row] = await db.update(genhalTownsTable).set(updates).where(eq(genhalTownsTable.id, id)).returning();
    res.json(row);
  } catch (err) { logger.error(err, "towns PATCH"); res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/towns/:id", requireAuth(), async (req, res) => {
  try {
    await db.delete(genhalTownsTable).where(eq(genhalTownsTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) { logger.error(err, "towns DELETE"); res.status(500).json({ error: "Failed" }); }
});

// ─── Rulers ───────────────────────────────────────────────────────────────────

router.get("/genhal/towns/:id/rulers", requireAuth(), async (req, res) => {
  try {
    const rows = await db.select().from(genhalTownRulersTable)
      .where(eq(genhalTownRulersTable.townId, Number(req.params.id)))
      .orderBy(asc(genhalTownRulersTable.reignStart));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.post("/genhal/towns/:id/rulers", requireAuth(), async (req, res) => {
  const townId = Number(req.params.id);
  const b = req.body;
  if (!b.name || !b.title) return res.status(400).json({ error: "name and title required" });
  try {
    if (b.isCurrent) {
      await db.update(genhalTownRulersTable).set({ isCurrent: false })
        .where(and(eq(genhalTownRulersTable.townId, townId), eq(genhalTownRulersTable.isCurrent, true)));
    }
    const [row] = await db.insert(genhalTownRulersTable).values({
      townId, name: b.name, localName: b.localName ?? null, title: b.title,
      reignStart: b.reignStart ? Number(b.reignStart) : null,
      reignEnd: b.reignEnd ? Number(b.reignEnd) : null,
      isCurrent: Boolean(b.isCurrent), bio: b.bio ?? null,
      achievements: b.achievements ?? null, imageUrl: b.imageUrl ?? null,
      treeId: b.treeId ? Number(b.treeId) : null, memberId: b.memberId ? Number(b.memberId) : null,
      successionNotes: b.successionNotes ?? null,
    }).returning();
    res.status(201).json(row);
  } catch (err) { logger.error(err, "rulers POST"); res.status(500).json({ error: "Failed" }); }
});

router.patch("/genhal/towns/:townId/rulers/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id); const b = req.body;
  try {
    if (b.isCurrent) {
      await db.update(genhalTownRulersTable).set({ isCurrent: false })
        .where(and(eq(genhalTownRulersTable.townId, Number(req.params.townId)), eq(genhalTownRulersTable.isCurrent, true)));
    }
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const f of ["name","localName","title","reignStart","reignEnd","isCurrent","bio","achievements","imageUrl","successionNotes","treeId","memberId"])
      if (b[f] !== undefined) updates[f] = b[f];
    const [row] = await db.update(genhalTownRulersTable).set(updates).where(eq(genhalTownRulersTable.id, id)).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/towns/:townId/rulers/:id", requireAuth(), async (req, res) => {
  try {
    await db.delete(genhalTownRulersTable).where(eq(genhalTownRulersTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ─── Compounds ────────────────────────────────────────────────────────────────

router.get("/genhal/towns/:id/compounds", requireAuth(), async (req, res) => {
  try {
    const compounds = await db.select().from(genhalCompoundsTable)
      .where(eq(genhalCompoundsTable.townId, Number(req.params.id)))
      .orderBy(asc(genhalCompoundsTable.name));
    const withChiefs = await Promise.all(compounds.map(async c => ({
      ...c,
      chiefs: await db.select().from(genhalCompoundChiefsTable)
        .where(eq(genhalCompoundChiefsTable.compoundId, c.id))
        .orderBy(asc(genhalCompoundChiefsTable.reignStart)),
    })));
    res.json(withChiefs);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.post("/genhal/towns/:id/compounds", requireAuth(), async (req, res) => {
  const townId = Number(req.params.id); const b = req.body;
  if (!b.name) return res.status(400).json({ error: "name required" });
  try {
    const [row] = await db.insert(genhalCompoundsTable).values({
      townId, name: b.name, localName: b.localName ?? null,
      description: b.description ?? null, imageUrl: b.imageUrl ?? null,
      headFamilyTreeId: b.headFamilyTreeId ? Number(b.headFamilyTreeId) : null,
      chiefTitle: b.chiefTitle ?? null,
    }).returning();
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.patch("/genhal/towns/:townId/compounds/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id); const b = req.body;
  try {
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const f of ["name","localName","description","imageUrl","headFamilyTreeId","chiefTitle"])
      if (b[f] !== undefined) updates[f] = b[f];
    const [row] = await db.update(genhalCompoundsTable).set(updates).where(eq(genhalCompoundsTable.id, id)).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/towns/:townId/compounds/:id", requireAuth(), async (req, res) => {
  try {
    await db.delete(genhalCompoundsTable).where(eq(genhalCompoundsTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ─── Compound Chiefs ──────────────────────────────────────────────────────────

router.post("/genhal/towns/:townId/compounds/:compoundId/chiefs", requireAuth(), async (req, res) => {
  const compoundId = Number(req.params.compoundId); const b = req.body;
  if (!b.name || !b.title) return res.status(400).json({ error: "name and title required" });
  try {
    if (b.isCurrent) {
      await db.update(genhalCompoundChiefsTable).set({ isCurrent: false })
        .where(and(eq(genhalCompoundChiefsTable.compoundId, compoundId), eq(genhalCompoundChiefsTable.isCurrent, true)));
    }
    const [row] = await db.insert(genhalCompoundChiefsTable).values({
      compoundId, name: b.name, localName: b.localName ?? null, title: b.title,
      reignStart: b.reignStart ? Number(b.reignStart) : null,
      reignEnd: b.reignEnd ? Number(b.reignEnd) : null,
      isCurrent: Boolean(b.isCurrent), bio: b.bio ?? null, imageUrl: b.imageUrl ?? null,
      treeId: b.treeId ? Number(b.treeId) : null, memberId: b.memberId ? Number(b.memberId) : null,
      successionNotes: b.successionNotes ?? null,
    }).returning();
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.patch("/genhal/towns/:townId/compounds/:compoundId/chiefs/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id); const b = req.body;
  try {
    if (b.isCurrent) {
      await db.update(genhalCompoundChiefsTable).set({ isCurrent: false })
        .where(and(eq(genhalCompoundChiefsTable.compoundId, Number(req.params.compoundId)), eq(genhalCompoundChiefsTable.isCurrent, true)));
    }
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const f of ["name","localName","title","reignStart","reignEnd","isCurrent","bio","imageUrl","successionNotes"])
      if (b[f] !== undefined) updates[f] = b[f];
    const [row] = await db.update(genhalCompoundChiefsTable).set(updates).where(eq(genhalCompoundChiefsTable.id, id)).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/towns/:townId/compounds/:compoundId/chiefs/:id", requireAuth(), async (req, res) => {
  try {
    await db.delete(genhalCompoundChiefsTable).where(eq(genhalCompoundChiefsTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ─── Town Records (history, traditions, festivals, ceremonies, resources) ─────

router.get("/genhal/towns/:id/records", requireAuth(), async (req, res) => {
  const { type } = req.query;
  try {
    const where = type
      ? and(eq(genhalTownRecordsTable.townId, Number(req.params.id)), eq(genhalTownRecordsTable.type, type as string))
      : eq(genhalTownRecordsTable.townId, Number(req.params.id));
    const rows = await db.select().from(genhalTownRecordsTable)
      .where(where).orderBy(asc(genhalTownRecordsTable.sortOrder), asc(genhalTownRecordsTable.createdAt));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.post("/genhal/towns/:id/records", requireAuth(), async (req, res) => {
  const townId = Number(req.params.id); const b = req.body;
  if (!b.type || !b.title) return res.status(400).json({ error: "type and title required" });
  try {
    const [row] = await db.insert(genhalTownRecordsTable).values({
      townId, type: b.type, title: b.title, content: b.content ?? null,
      period: b.period ?? null, imageUrl: b.imageUrl ?? null,
      mediaUrls: b.mediaUrls ?? [], tags: b.tags ?? [],
      sortOrder: b.sortOrder ? Number(b.sortOrder) : 0,
    }).returning();
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.patch("/genhal/towns/:townId/records/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id); const b = req.body;
  try {
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const f of ["type","title","content","period","imageUrl","mediaUrls","tags","sortOrder"])
      if (b[f] !== undefined) updates[f] = b[f];
    const [row] = await db.update(genhalTownRecordsTable).set(updates).where(eq(genhalTownRecordsTable.id, id)).returning();
    res.json(row);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

router.delete("/genhal/towns/:townId/records/:id", requireAuth(), async (req, res) => {
  try {
    await db.delete(genhalTownRecordsTable).where(eq(genhalTownRecordsTable.id, Number(req.params.id)));
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

export default router;
