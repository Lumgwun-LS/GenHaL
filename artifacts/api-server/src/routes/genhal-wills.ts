/**
 * Family Will & Testament routes.
 *
 * Content is encrypted server-side with AES-256-GCM using a PBKDF2-derived key.
 * The passphrase is verified via scrypt (timing-safe) but never stored.
 * Only family members can access will metadata; decryption requires the passphrase.
 */

import { Router } from "express";
import { requireAuth, getAuth } from "@clerk/express";
import { eq, and, desc, inArray } from "drizzle-orm";
import crypto from "crypto";
import { db } from "@workspace/db";
import {
  genhalFamilyWillsTable,
  genhalFamilyAccountsTable,
  genhalFamilyMembersTable,
  genhalSecretAccountsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireUserId(req: any, res: any): string | null {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return null; }
  return userId;
}

async function resolveFamilyMember(familyId: number, clerkUserId: string) {
  const [member] = await db
    .select()
    .from(genhalFamilyMembersTable)
    .where(
      and(
        eq(genhalFamilyMembersTable.familyId, familyId),
        eq(genhalFamilyMembersTable.clerkUserId, clerkUserId),
      ),
    );
  return member ?? null;
}

/** AES-256-GCM encryption — returns all fields needed for later decryption. */
function encryptContent(content: string, passphrase: string) {
  // Unique salt per will for key derivation
  const encSalt = crypto.randomBytes(32);
  const key = crypto.pbkdf2Sync(passphrase, encSalt, 100_000, 32, "sha256");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(content, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Separate scrypt verifier so the encryption key is never re-derived for verification
  const verSalt = crypto.randomBytes(32);
  const verifier = crypto.scryptSync(passphrase, verSalt, 64);

  return {
    encryptedContent:  encrypted.toString("base64"),
    encryptionIv:      iv.toString("hex"),
    encryptionSalt:    encSalt.toString("hex"),
    encryptionAuthTag: authTag.toString("hex"),
    passphraseVerifier: verifier.toString("hex"),
    passphraseSalt:     verSalt.toString("hex"),
  };
}

/** Verify a passphrase against its stored scrypt verifier. */
function verifyPassphrase(passphrase: string, verifier: string, salt: string): boolean {
  try {
    const computed = crypto.scryptSync(passphrase, Buffer.from(salt, "hex"), 64);
    return crypto.timingSafeEqual(computed, Buffer.from(verifier, "hex"));
  } catch {
    return false;
  }
}

/** AES-256-GCM decryption — throws if passphrase/auth-tag is wrong. */
function decryptContent(
  encryptedContent: string,
  iv: string,
  salt: string,
  authTag: string,
  passphrase: string,
): string {
  const key = crypto.pbkdf2Sync(passphrase, Buffer.from(salt, "hex"), 100_000, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedContent, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Strip crypto fields before sending will metadata to the client. */
function serializeWill(w: typeof genhalFamilyWillsTable.$inferSelect) {
  const { encryptedContent, encryptionIv, encryptionSalt, encryptionAuthTag, passphraseVerifier, passphraseSalt, ...meta } = w;
  const linkedAccountIds: number[] = (() => {
    try { return JSON.parse(meta.linkedAccountIds); } catch { return []; }
  })();
  return {
    ...meta,
    authorizedPersons: (() => {
      try { return JSON.parse(meta.authorizedPersons); } catch { return []; }
    })(),
    linkedAccountIds,
    linkedAccountCount: linkedAccountIds.length,
    hasEncryptedContent: Boolean(encryptedContent),
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /genhal/families/:id/wills
 * Returns will metadata for all active wills in this family.
 * Visible to all authenticated family members (and the family head/admin).
 * Sensitive crypto fields are NEVER returned here.
 */
router.get("/genhal/families/:id/wills", requireAuth(), async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const familyId = Number(req.params.id);
  if (!familyId) return void res.status(400).json({ error: "Invalid family ID" });

  const member = await resolveFamilyMember(familyId, userId);
  if (!member) return void res.status(403).json({ error: "Not a family member" });

  try {
    const wills = await db
      .select()
      .from(genhalFamilyWillsTable)
      .where(and(
        eq(genhalFamilyWillsTable.familyId, familyId),
        eq(genhalFamilyWillsTable.status, "active"),
      ))
      .orderBy(desc(genhalFamilyWillsTable.createdAt));

    res.json({
      count: wills.length,
      currentUserClerkId: userId,
      wills: wills.map(w => serializeWill(w)),
    });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Failed to load wills" });
  }
});

/**
 * GET /genhal/families/:id/wills/:willId
 * Returns a single will's metadata (no crypto fields, no decrypted content).
 */
router.get("/genhal/families/:id/wills/:willId", requireAuth(), async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const familyId = Number(req.params.id);
  const willId   = Number(req.params.willId);

  const member = await resolveFamilyMember(familyId, userId);
  if (!member) return void res.status(403).json({ error: "Not a family member" });

  try {
    const [will] = await db
      .select()
      .from(genhalFamilyWillsTable)
      .where(and(eq(genhalFamilyWillsTable.id, willId), eq(genhalFamilyWillsTable.familyId, familyId)));
    if (!will) return void res.status(404).json({ error: "Will not found" });

    res.json(serializeWill(will));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Failed to load will" });
  }
});

/**
 * POST /genhal/families/:id/wills
 * Create a new will.  Only one active will per author per family.
 */
router.post("/genhal/families/:id/wills", requireAuth(), async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const familyId = Number(req.params.id);
  const member = await resolveFamilyMember(familyId, userId);
  if (!member) return void res.status(403).json({ error: "Not a family member" });

  const { title, content, passphrase, summary, accessCondition, authorizedPersons, linkedAccountIds } = req.body;
  if (!content)    return void res.status(400).json({ error: "Will content is required" });
  if (!passphrase) return void res.status(400).json({ error: "A passphrase is required to encrypt the will" });
  if (passphrase.length < 8) return void res.status(400).json({ error: "Passphrase must be at least 8 characters" });

  // Check for existing active will by this author in this family
  const [existing] = await db
    .select({ id: genhalFamilyWillsTable.id })
    .from(genhalFamilyWillsTable)
    .where(and(
      eq(genhalFamilyWillsTable.familyId, familyId),
      eq(genhalFamilyWillsTable.authorClerkId, userId),
      eq(genhalFamilyWillsTable.status, "active"),
    ));
  if (existing) return void res.status(409).json({ error: "You already have an active will. Update or revoke it first." });

  try {
    const encrypted = encryptContent(content, passphrase);

    const [row] = await db
      .insert(genhalFamilyWillsTable)
      .values({
        familyId,
        authorClerkId: userId,
        authorName: (req.body.authorName as string | undefined) ?? "Family Member",
        title: title ?? "My Last Will & Testament",
        summary: summary ?? null,
        accessCondition: accessCondition ?? null,
        authorizedPersons: JSON.stringify(Array.isArray(authorizedPersons) ? authorizedPersons : []),
        linkedAccountIds: JSON.stringify(Array.isArray(linkedAccountIds) ? linkedAccountIds.map(Number).filter(Boolean) : []),
        ...encrypted,
        status: "active",
      })
      .returning();

    res.status(201).json(serializeWill(row));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Failed to create will" });
  }
});

/**
 * PATCH /genhal/families/:id/wills/:willId
 * Update will metadata or content.  Author only.
 * If `content` + `passphrase` provided, re-encrypts.
 */
router.patch("/genhal/families/:id/wills/:willId", requireAuth(), async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const familyId = Number(req.params.id);
  const willId   = Number(req.params.willId);

  const [will] = await db
    .select()
    .from(genhalFamilyWillsTable)
    .where(and(eq(genhalFamilyWillsTable.id, willId), eq(genhalFamilyWillsTable.familyId, familyId)));
  if (!will) return void res.status(404).json({ error: "Will not found" });
  if (will.authorClerkId !== userId) return void res.status(403).json({ error: "Only the will author can modify it" });

  const { title, content, passphrase, summary, accessCondition, authorizedPersons, linkedAccountIds } = req.body;
  let encFields: ReturnType<typeof encryptContent> | undefined;

  if (content !== undefined) {
    if (!passphrase) return void res.status(400).json({ error: "Passphrase required when updating will content" });
    if (passphrase.length < 8) return void res.status(400).json({ error: "Passphrase must be at least 8 characters" });
    encFields = encryptContent(content, passphrase);
  }

  try {
    const [updated] = await db
      .update(genhalFamilyWillsTable)
      .set({
        ...(title !== undefined ? { title } : {}),
        ...(summary !== undefined ? { summary } : {}),
        ...(accessCondition !== undefined ? { accessCondition } : {}),
        ...(authorizedPersons !== undefined ? { authorizedPersons: JSON.stringify(Array.isArray(authorizedPersons) ? authorizedPersons : []) } : {}),
        ...(linkedAccountIds !== undefined ? { linkedAccountIds: JSON.stringify(Array.isArray(linkedAccountIds) ? linkedAccountIds.map(Number).filter(Boolean) : []) } : {}),
        ...(encFields ?? {}),
        updatedAt: new Date(),
      })
      .where(eq(genhalFamilyWillsTable.id, willId))
      .returning();

    res.json(serializeWill(updated));
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Failed to update will" });
  }
});

/**
 * DELETE /genhal/families/:id/wills/:willId
 * Revoke (soft-delete) a will.  Author only.
 */
router.delete("/genhal/families/:id/wills/:willId", requireAuth(), async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const familyId = Number(req.params.id);
  const willId   = Number(req.params.willId);

  const [will] = await db
    .select({ id: genhalFamilyWillsTable.id, authorClerkId: genhalFamilyWillsTable.authorClerkId })
    .from(genhalFamilyWillsTable)
    .where(and(eq(genhalFamilyWillsTable.id, willId), eq(genhalFamilyWillsTable.familyId, familyId)));
  if (!will) return void res.status(404).json({ error: "Will not found" });
  if (will.authorClerkId !== userId) return void res.status(403).json({ error: "Only the will author can revoke it" });

  try {
    await db
      .update(genhalFamilyWillsTable)
      .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(genhalFamilyWillsTable.id, willId));

    res.status(204).send();
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Failed to revoke will" });
  }
});

/**
 * POST /genhal/families/:id/wills/:willId/access
 * Decrypt and return will content.
 * Requires:
 *   1. Authenticated family member
 *   2. Correct passphrase
 *
 * The decrypted content is returned once and never cached server-side.
 */
router.post("/genhal/families/:id/wills/:willId/access", requireAuth(), async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const familyId = Number(req.params.id);
  const willId   = Number(req.params.willId);

  const member = await resolveFamilyMember(familyId, userId);
  if (!member) return void res.status(403).json({ error: "Not a family member" });

  const { passphrase } = req.body;
  if (!passphrase) return void res.status(400).json({ error: "Passphrase is required" });

  try {
    const [will] = await db
      .select()
      .from(genhalFamilyWillsTable)
      .where(and(eq(genhalFamilyWillsTable.id, willId), eq(genhalFamilyWillsTable.familyId, familyId)));
    if (!will) return void res.status(404).json({ error: "Will not found" });
    if (will.status !== "active") return void res.status(410).json({ error: "This will has been revoked" });

    if (!will.encryptedContent || !will.encryptionIv || !will.encryptionSalt || !will.encryptionAuthTag) {
      return void res.status(422).json({ error: "Will content was not encrypted. No content to show." });
    }
    if (!will.passphraseVerifier || !will.passphraseSalt) {
      return void res.status(422).json({ error: "Will has no passphrase set" });
    }

    // 1. Verify passphrase before attempting decryption
    if (!verifyPassphrase(passphrase, will.passphraseVerifier, will.passphraseSalt)) {
      return void res.status(401).json({ error: "Incorrect passphrase" });
    }

    // 2. Decrypt
    let content: string;
    try {
      content = decryptContent(
        will.encryptedContent,
        will.encryptionIv,
        will.encryptionSalt,
        will.encryptionAuthTag,
        passphrase,
      );
    } catch {
      return void res.status(401).json({ error: "Decryption failed — passphrase may be incorrect" });
    }

    // 3. Fetch linked secret accounts (details revealed only after successful decryption)
    let linkedAccounts: typeof genhalSecretAccountsTable.$inferSelect[] = [];
    const accountIds: number[] = (() => {
      try { return JSON.parse(will.linkedAccountIds ?? "[]"); } catch { return []; }
    })();
    if (accountIds.length > 0) {
      linkedAccounts = await db
        .select()
        .from(genhalSecretAccountsTable)
        .where(inArray(genhalSecretAccountsTable.id, accountIds));
    }

    // 4. Return decrypted content (never stored server-side)
    res.json({
      willId: will.id,
      title: will.title,
      authorName: will.authorName,
      accessCondition: will.accessCondition,
      accessedAt: new Date().toISOString(),
      content,
      linkedAccounts: linkedAccounts.map(a => ({
        id:            a.id,
        currency:      a.currency,
        provider:      a.provider,
        accountNumber: a.accountNumber,
        accountName:   a.accountName,
        bankName:      a.bankName,
        routingNumber: a.routingNumber,
        isActive:      a.isActive,
      })),
    });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: "Failed to access will" });
  }
});

export default router;
