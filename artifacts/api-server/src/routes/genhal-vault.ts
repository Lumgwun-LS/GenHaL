/**
 * GenHaL Vault — document/media vault for kingdoms and families
 * Backed by Cloudflare R2 (presigned upload → client uploads directly)
 */
import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { db } from "@workspace/db";
import {
  genhalVaultDocumentsTable,
  genhalVaultAccessGrantsTable,
  genhalKingdomMembersTable,
  genhalFamilyMembersTable,
  genhalSubscriptionsTable,
} from "@workspace/db";
import { eq, and, or, desc, sql } from "drizzle-orm";
import {
  isR2Configured, generateR2Key, createUploadUrl,
  createDownloadUrl, publicUrl, deleteObject, headObject,
} from "../lib/genhal-r2";
import { GENHAL_PLANS, type GenHalPlan } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

// ─── RBAC helpers ─────────────────────────────────────────────────────────────
const KINGDOM_ROLE_RANK: Record<string, number> = {
  king: 9, queen_mother: 8, council_chief: 7, elder: 6,
  cdc_member: 5, family_head: 4, member: 2, viewer: 1, guest: 0,
};
const FAMILY_ROLE_RANK: Record<string, number> = {
  head: 9, co_head: 8, elder: 6, adult: 4, child: 2, viewer: 1,
};

async function getKingdomRole(kingdomId: number, clerkUserId: string): Promise<string | null> {
  const [m] = await db.select().from(genhalKingdomMembersTable)
    .where(and(eq(genhalKingdomMembersTable.kingdomId, kingdomId), eq(genhalKingdomMembersTable.clerkUserId, clerkUserId), eq(genhalKingdomMembersTable.status, "active")));
  return m?.role ?? null;
}

async function getFamilyRole(familyId: number, clerkUserId: string): Promise<string | null> {
  const [m] = await db.select().from(genhalFamilyMembersTable)
    .where(and(eq(genhalFamilyMembersTable.familyId, familyId), eq(genhalFamilyMembersTable.clerkUserId, clerkUserId), eq(genhalFamilyMembersTable.status, "active")));
  return m?.role ?? null;
}

function canAccessDoc(doc: any, userRole: string, userId: string, rankFn: (r: string) => number): boolean {
  const level = doc.accessLevel;
  if (level === "public") return true;
  if (!userRole) return false;
  if (level === "members") return rankFn(userRole) >= 2;
  if (level === "elders_and_above") return rankFn(userRole) >= 6;
  if (level === "admins") return rankFn(userRole) >= 7;
  if (level === "specific_roles") return doc.allowedRoles?.includes(userRole) ?? false;
  return false;
}

async function getSubscription(unitType: string, unitId: number) {
  const [sub] = await db.select().from(genhalSubscriptionsTable)
    .where(and(eq(genhalSubscriptionsTable.unitType, unitType), eq(genhalSubscriptionsTable.unitId, unitId)));
  return sub ?? null;
}

// ── Request upload URL (client uploads directly to R2) ────────────────────────
router.post("/genhal/vault/upload-url", requireAuth(), async (req, res) => {
  const userId = req.auth!.userId;
  const { unitType, unitId, fileName, mimeType, fileType = "document" } = req.body;
  if (!unitType || !unitId || !fileName || !mimeType) {
    return res.status(400).json({ error: "unitType, unitId, fileName, mimeType required" });
  }
  if (!isR2Configured()) {
    return res.status(503).json({ error: "Storage not configured. R2 credentials missing." });
  }
  // Check membership
  let userRole: string | null = null;
  if (unitType === "kingdom") userRole = await getKingdomRole(Number(unitId), userId);
  else userRole = await getFamilyRole(Number(unitId), userId);
  if (!userRole || KINGDOM_ROLE_RANK[userRole] < 2) {
    return res.status(403).json({ error: "Members only" });
  }
  // Check storage quota
  const sub = await getSubscription(unitType, Number(unitId));
  if (sub && sub.storageLimitBytes > 0 && sub.storageUsedBytes >= sub.storageLimitBytes) {
    return res.status(402).json({ error: "Storage quota exceeded. Please upgrade your plan." });
  }
  try {
    const folder = unitType === "kingdom" ? `kingdoms/${unitId}` : `families/${unitId}`;
    const r2Key = generateR2Key(folder, fileName);
    const uploadUrl = await createUploadUrl(r2Key, mimeType);
    res.json({ uploadUrl, r2Key, fileUrl: publicUrl(r2Key) });
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed to generate upload URL" }); }
});

// ── Create document record (after upload) ────────────────────────────────────
router.post("/genhal/vault/documents", requireAuth(), async (req, res) => {
  const userId = req.auth!.userId;
  const b = req.body;
  const { unitType, unitId } = b;
  if (!unitType || !unitId || !b.title) return res.status(400).json({ error: "unitType, unitId, title required" });

  const uid = Number(unitId);
  let userRole: string | null = null;
  if (unitType === "kingdom") userRole = await getKingdomRole(uid, userId);
  else userRole = await getFamilyRole(uid, userId);
  if (!userRole || KINGDOM_ROLE_RANK[userRole] < 2) return res.status(403).json({ error: "Members only" });

  // Check vault document quota
  const sub = await getSubscription(unitType, uid);
  if (sub && sub.maxVaultDocuments > 0 && sub.vaultDocumentCount >= sub.maxVaultDocuments) {
    return res.status(402).json({ error: "Vault document limit reached. Please upgrade your plan." });
  }

  try {
    // Determine file size from R2 if we have a key
    let fileSizeBytes = b.fileSizeBytes ? Number(b.fileSizeBytes) : null;
    if (b.r2Key && !fileSizeBytes) {
      const meta = await headObject(b.r2Key);
      if (meta.exists) fileSizeBytes = meta.size;
    }

    const kingdomId = unitType === "kingdom" ? uid : (b.kingdomId ? Number(b.kingdomId) : null);
    const [doc] = await db.insert(genhalVaultDocumentsTable).values({
      unitType, unitId: uid, kingdomId,
      title: b.title, description: b.description ?? null, accessInstructions: b.accessInstructions ?? null,
      r2Key: b.r2Key ?? null, fileUrl: b.fileUrl ?? null, fileName: b.fileName ?? null,
      fileType: b.fileType ?? "document", mimeType: b.mimeType ?? null,
      fileSizeBytes: fileSizeBytes ?? null,
      category: b.category ?? null, isWill: Boolean(b.isWill),
      tags: b.tags ?? [], attributes: b.attributes ?? null,
      accessLevel: b.accessLevel ?? "members",
      allowedRoles: b.allowedRoles ?? [],
      uploadStatus: b.r2Key ? "complete" : "pending",
      sortOrder: b.sortOrder ? Number(b.sortOrder) : 0,
      uploadedByClerkUserId: userId,
    }).returning();

    // Update storage usage counter
    if (fileSizeBytes && sub) {
      await db.update(genhalSubscriptionsTable).set({
        storageUsedBytes: (sub.storageUsedBytes ?? 0) + fileSizeBytes,
        vaultDocumentCount: (sub.vaultDocumentCount ?? 0) + 1,
        updatedAt: new Date(),
      }).where(eq(genhalSubscriptionsTable.id, sub.id));
    }

    res.status(201).json(doc);
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed to create document" }); }
});

// ── List vault documents ──────────────────────────────────────────────────────
router.get("/genhal/vault/documents", requireAuth(), async (req, res) => {
  const userId = req.auth!.userId;
  const { unitType, unitId, fileType, category, archived } = req.query;
  if (!unitType || !unitId) return res.status(400).json({ error: "unitType and unitId required" });

  const uid = Number(unitId);
  let userRole: string | null = null;
  if (unitType === "kingdom") userRole = await getKingdomRole(uid, userId);
  else userRole = await getFamilyRole(uid, userId);

  try {
    const conds: any[] = [
      eq(genhalVaultDocumentsTable.unitType, unitType as string),
      eq(genhalVaultDocumentsTable.unitId, uid),
    ];
    if (archived === "true") conds.push(eq(genhalVaultDocumentsTable.isArchived, true));
    else conds.push(eq(genhalVaultDocumentsTable.isArchived, false));
    if (fileType) conds.push(eq(genhalVaultDocumentsTable.fileType, fileType as string));
    if (category) conds.push(eq(genhalVaultDocumentsTable.category, category as string));

    const docs = await db.select().from(genhalVaultDocumentsTable).where(and(...conds)).orderBy(desc(genhalVaultDocumentsTable.createdAt));

    const rankFn = unitType === "family" ? (r: string) => FAMILY_ROLE_RANK[r] ?? 0 : (r: string) => KINGDOM_ROLE_RANK[r] ?? 0;
    const visible = docs.filter(d => {
      // Uploader always sees their own
      if (d.uploadedByClerkUserId === userId) return true;
      // Check individual grant
      // (skip DB check here — we return all and let client handle personal grants, or
      //  do a secondary query for individual grants below)
      return canAccessDoc(d, userRole ?? "", userId, rankFn);
    });

    res.json(visible);
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed" }); }
});

// ── Get single document + presigned download URL ──────────────────────────────
router.get("/genhal/vault/documents/:id", requireAuth(), async (req, res) => {
  const userId = req.auth!.userId;
  try {
    const [doc] = await db.select().from(genhalVaultDocumentsTable).where(eq(genhalVaultDocumentsTable.id, Number(req.params.id)));
    if (!doc) return res.status(404).json({ error: "Not found" });

    const uid = doc.unitId;
    let userRole: string | null = null;
    if (doc.unitType === "kingdom") userRole = await getKingdomRole(uid, userId);
    else userRole = await getFamilyRole(uid, userId);

    const rankFn = doc.unitType === "family" ? (r: string) => FAMILY_ROLE_RANK[r] ?? 0 : (r: string) => KINGDOM_ROLE_RANK[r] ?? 0;
    const canView = doc.uploadedByClerkUserId === userId || canAccessDoc(doc, userRole ?? "", userId, rankFn);
    if (!canView) return res.status(403).json({ error: "Access denied" });

    // Generate fresh presigned URL if R2 key exists
    let downloadUrl = doc.fileUrl;
    if (doc.r2Key && isR2Configured()) {
      downloadUrl = await createDownloadUrl(doc.r2Key);
    }

    // Increment view count
    await db.update(genhalVaultDocumentsTable).set({ viewCount: doc.viewCount + 1 }).where(eq(genhalVaultDocumentsTable.id, doc.id));

    res.json({ ...doc, downloadUrl });
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed" }); }
});

// ── Update document metadata ──────────────────────────────────────────────────
router.patch("/genhal/vault/documents/:id", requireAuth(), async (req, res) => {
  const userId = req.auth!.userId;
  const b = req.body;
  try {
    const [doc] = await db.select().from(genhalVaultDocumentsTable).where(eq(genhalVaultDocumentsTable.id, Number(req.params.id)));
    if (!doc) return res.status(404).json({ error: "Not found" });

    // Only uploader or admins can edit
    let userRole: string | null = null;
    if (doc.unitType === "kingdom") userRole = await getKingdomRole(doc.unitId, userId);
    else userRole = await getFamilyRole(doc.unitId, userId);
    const rankFn = doc.unitType === "family" ? (r: string) => FAMILY_ROLE_RANK[r] ?? 0 : (r: string) => KINGDOM_ROLE_RANK[r] ?? 0;
    if (doc.uploadedByClerkUserId !== userId && rankFn(userRole ?? "") < 7) {
      return res.status(403).json({ error: "Only admins or the uploader can edit" });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    const fields = ["title","description","accessInstructions","fileType","category","isWill","tags","attributes","accessLevel","allowedRoles","isArchived","sortOrder","uploadStatus","fileUrl","fileName","mimeType","r2Key"];
    for (const f of fields) if (b[f] !== undefined) updates[f] = b[f];
    const [updated] = await db.update(genhalVaultDocumentsTable).set(updates).where(eq(genhalVaultDocumentsTable.id, doc.id)).returning();
    res.json(updated);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ── Delete document ────────────────────────────────────────────────────────────
router.delete("/genhal/vault/documents/:id", requireAuth(), async (req, res) => {
  const userId = req.auth!.userId;
  try {
    const [doc] = await db.select().from(genhalVaultDocumentsTable).where(eq(genhalVaultDocumentsTable.id, Number(req.params.id)));
    if (!doc) return res.status(404).json({ error: "Not found" });

    let userRole: string | null = null;
    if (doc.unitType === "kingdom") userRole = await getKingdomRole(doc.unitId, userId);
    else userRole = await getFamilyRole(doc.unitId, userId);
    const rankFn = doc.unitType === "family" ? (r: string) => FAMILY_ROLE_RANK[r] ?? 0 : (r: string) => KINGDOM_ROLE_RANK[r] ?? 0;
    if (doc.uploadedByClerkUserId !== userId && rankFn(userRole ?? "") < 7) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Delete from R2 first
    if (doc.r2Key && isR2Configured()) {
      try { await deleteObject(doc.r2Key); } catch { /* ignore — may already be gone */ }
    }

    await db.delete(genhalVaultDocumentsTable).where(eq(genhalVaultDocumentsTable.id, doc.id));

    // Update storage counter
    if (doc.fileSizeBytes) {
      const sub = await getSubscription(doc.unitType, doc.unitId);
      if (sub) {
        await db.update(genhalSubscriptionsTable).set({
          storageUsedBytes: Math.max(0, (sub.storageUsedBytes ?? 0) - doc.fileSizeBytes),
          vaultDocumentCount: Math.max(0, (sub.vaultDocumentCount ?? 0) - 1),
          updatedAt: new Date(),
        }).where(eq(genhalSubscriptionsTable.id, sub.id));
      }
    }

    res.status(204).send();
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// ── Confirm upload complete (client calls after PUT to R2) ────────────────────
router.post("/genhal/vault/documents/:id/confirm-upload", requireAuth(), async (req, res) => {
  const { fileSizeBytes } = req.body;
  try {
    const updates: Record<string, any> = { uploadStatus: "complete", updatedAt: new Date() };
    if (fileSizeBytes) updates.fileSizeBytes = Number(fileSizeBytes);
    const [doc] = await db.update(genhalVaultDocumentsTable).set(updates).where(eq(genhalVaultDocumentsTable.id, Number(req.params.id))).returning();
    res.json(doc);
  } catch { res.status(500).json({ error: "Failed" }); }
});

// ── Grant individual access ───────────────────────────────────────────────────
router.post("/genhal/vault/documents/:id/grants", requireAuth(), async (req, res) => {
  const userId = req.auth!.userId;
  const { granteeClerkUserId, expiresAt } = req.body;
  if (!granteeClerkUserId) return res.status(400).json({ error: "granteeClerkUserId required" });
  try {
    const [doc] = await db.select().from(genhalVaultDocumentsTable).where(eq(genhalVaultDocumentsTable.id, Number(req.params.id)));
    if (!doc) return res.status(404).json({ error: "Not found" });
    const [grant] = await db.insert(genhalVaultAccessGrantsTable).values({
      documentId: doc.id, granteeClerkUserId,
      grantedByClerkUserId: userId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();
    res.status(201).json(grant);
  } catch { res.status(500).json({ error: "Failed" }); }
});

export default router;
