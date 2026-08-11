/**
 * GenHaL Vault — public & encrypted-download extensions.
 *
 * GET  /genhal/vault/public/:unitType/:unitId   — public gallery (no auth)
 * GET  /genhal/vault/:docId/download            — authenticated download (decrypts if encrypted)
 * POST /genhal/vault/:docId/encrypt             — admin: encrypt a private document in place
 */
import { Router } from "express";
import { getAuth, requireAuth } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import {
  db,
  genhalVaultDocumentsTable,
  genhalKingdomMembersTable,
  genhalFamilyMembersTable,
} from "@workspace/db";
import {
  isR2Configured, publicUrl, createDownloadUrl,
  encryptR2Object, decryptR2Object, getObjectBuffer,
} from "../lib/genhal-r2";
import { logger } from "../lib/logger";

const router = Router();

const KINGDOM_ROLE_RANK: Record<string, number> = {
  king: 9, queen_mother: 8, council_chief: 7, elder: 6,
  cdc_member: 5, family_head: 4, member: 2, viewer: 1, guest: 0,
};
const FAMILY_ROLE_RANK: Record<string, number> = {
  head: 9, co_head: 8, elder: 6, adult: 4, child: 2, viewer: 1,
};

function isAdmin(userId: string) {
  return (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean).includes(userId);
}

async function getRole(unitType: string, unitId: number, userId: string) {
  if (unitType === "kingdom") {
    const [m] = await db.select({ role: genhalKingdomMembersTable.role })
      .from(genhalKingdomMembersTable)
      .where(and(
        eq(genhalKingdomMembersTable.kingdomId, unitId),
        eq(genhalKingdomMembersTable.clerkUserId, userId),
        eq(genhalKingdomMembersTable.status, "active"),
      )).limit(1);
    return m?.role ?? null;
  }
  const [m] = await db.select({ role: genhalFamilyMembersTable.role })
    .from(genhalFamilyMembersTable)
    .where(and(
      eq(genhalFamilyMembersTable.familyId, unitId),
      eq(genhalFamilyMembersTable.clerkUserId, userId),
      eq(genhalFamilyMembersTable.status, "active"),
    )).limit(1);
  return m?.role ?? null;
}

// ── GET /genhal/vault/public/:unitType/:unitId ────────────────────────────────
// Public gallery — no auth required. Only returns documents marked accessLevel="public".
// Encrypted documents are never included here (they can't be public + encrypted).

router.get("/genhal/vault/public/:unitType/:unitId", async (req, res): Promise<void> => {
  const unitType = req.params.unitType;
  const unitId   = Number(req.params.unitId);
  if (!["kingdom","family","compound"].includes(unitType) || isNaN(unitId)) {
    res.status(400).json({ error: "Invalid unit" }); return;
  }

  try {
    const docs = await db.select().from(genhalVaultDocumentsTable)
      .where(and(
        eq(genhalVaultDocumentsTable.unitType, unitType),
        eq(genhalVaultDocumentsTable.unitId, unitId),
        eq(genhalVaultDocumentsTable.accessLevel, "public"),
        eq(genhalVaultDocumentsTable.uploadStatus, "complete"),
        eq(genhalVaultDocumentsTable.isArchived, false),
      ))
      .orderBy(genhalVaultDocumentsTable.sortOrder, genhalVaultDocumentsTable.createdAt);

    const result = docs.map(d => ({
      id:          d.id,
      title:       d.title,
      description: d.description,
      fileType:    d.fileType,
      mimeType:    d.mimeType,
      category:    d.category,
      tags:        d.tags,
      isWill:      d.isWill,
      fileUrl:     d.r2Key ? publicUrl(d.r2Key) : d.fileUrl,
      fileName:    d.fileName,
      viewCount:   d.viewCount,
      createdAt:   d.createdAt,
    }));

    // Increment view counts asynchronously
    if (result.length > 0) {
      const ids = result.map(d => d.id);
      db.execute(
        `UPDATE genhal_vault_documents SET view_count = view_count + 1 WHERE id = ANY($1)` as never,
      ).catch(() => {});
    }

    res.json(result);
  } catch (err) {
    logger.error(err, "genhal-vault-public GET failed");
    res.status(500).json({ error: "Failed to load public gallery" });
  }
});

// ── GET /genhal/vault/:docId/download ─────────────────────────────────────────
// Authenticated document download. For encrypted docs, decrypts on the fly.
// For non-encrypted private docs, returns a short-lived signed URL redirect.

router.get("/genhal/vault/:docId/download", requireAuth(), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const docId  = Number(req.params.docId);

  try {
    const [doc] = await db.select().from(genhalVaultDocumentsTable)
      .where(eq(genhalVaultDocumentsTable.id, docId)).limit(1);
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    if (!doc.r2Key) { res.status(404).json({ error: "No file stored for this document" }); return; }

    // Access check
    const rankFn = doc.unitType === "family"
      ? (r: string) => FAMILY_ROLE_RANK[r] ?? 0
      : (r: string) => KINGDOM_ROLE_RANK[r] ?? 0;

    if (doc.accessLevel !== "public") {
      const role = await getRole(doc.unitType, doc.unitId, userId);
      const isUploader = doc.uploadedByClerkUserId === userId;
      const adminOk = isAdmin(userId);

      let allowed = isUploader || adminOk;
      if (!allowed && role) {
        const lvl = doc.accessLevel;
        if (lvl === "members")           allowed = rankFn(role) >= 2;
        else if (lvl === "elders_and_above") allowed = rankFn(role) >= 6;
        else if (lvl === "admins")       allowed = rankFn(role) >= 7;
        else if (lvl === "specific_roles") allowed = doc.allowedRoles?.includes(role) ?? false;
      }
      if (!allowed) { res.status(403).json({ error: "Access denied" }); return; }
    }

    // Increment download count
    await db.update(genhalVaultDocumentsTable)
      .set({ downloadCount: (doc.downloadCount ?? 0) + 1 })
      .where(eq(genhalVaultDocumentsTable.id, docId));

    if (doc.isEncrypted) {
      // Decrypt in memory and stream to client
      const plain = await decryptR2Object(doc.r2Key);
      res.setHeader("Content-Type",        doc.mimeType ?? "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${doc.fileName ?? "download"}"`);
      res.setHeader("Content-Length",      String(plain.length));
      res.send(plain);
    } else {
      // Redirect to a short-lived signed GET URL (avoids proxying large files)
      const signedUrl = await createDownloadUrl(doc.r2Key, 300);
      res.redirect(signedUrl);
    }
  } catch (err) {
    logger.error(err, "genhal-vault download failed");
    res.status(500).json({ error: "Download failed" });
  }
});

// ── POST /genhal/vault/:docId/encrypt ─────────────────────────────────────────
// Encrypt a private document in place. Only for non-public docs.
// Downloads the raw file from R2, encrypts with AES-256-GCM, re-uploads.

router.post("/genhal/vault/:docId/encrypt", requireAuth(), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const docId  = Number(req.params.docId);

  try {
    const [doc] = await db.select().from(genhalVaultDocumentsTable)
      .where(eq(genhalVaultDocumentsTable.id, docId)).limit(1);
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    if (doc.accessLevel === "public") {
      res.status(400).json({ error: "Public documents cannot be encrypted" }); return;
    }
    if (doc.isEncrypted) {
      res.status(409).json({ error: "Document is already encrypted" }); return; 
    }
    if (!doc.r2Key) { res.status(400).json({ error: "No R2 file to encrypt" }); return; }

    // Must be uploader, unit admin, or system admin
    const role = await getRole(doc.unitType, doc.unitId, userId);
    const rankFn = doc.unitType === "family"
      ? (r: string) => FAMILY_ROLE_RANK[r] ?? 0
      : (r: string) => KINGDOM_ROLE_RANK[r] ?? 0;
    const canEncrypt = doc.uploadedByClerkUserId === userId
      || isAdmin(userId)
      || (role && rankFn(role) >= 7);
    if (!canEncrypt) { res.status(403).json({ error: "Insufficient permission to encrypt this document" }); return; }

    const ivHex = await encryptR2Object(doc.r2Key, doc.mimeType ?? "application/octet-stream");
    await db.update(genhalVaultDocumentsTable)
      .set({ isEncrypted: true, encryptionIv: ivHex, updatedAt: new Date() })
      .where(eq(genhalVaultDocumentsTable.id, docId));

    res.json({ success: true, message: "Document encrypted and stored securely." });
  } catch (err) {
    logger.error(err, "genhal-vault encrypt failed");
    res.status(500).json({ error: "Encryption failed" });
  }
});

export default router;
