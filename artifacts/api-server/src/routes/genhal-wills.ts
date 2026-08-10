/**
 * Family Will & Testament routes.
 *
 * Encryption model:
 *
 *   Legacy scheme ('passphrase') — existing wills:
 *     Content encrypted directly with PBKDF2(passphrase)-derived key.
 *     Access requires knowing the passphrase.
 *
 *   Split-key scheme ('split-key') — new wills with named executors:
 *     A random 32-byte content key encrypts the content.
 *     That content key is stored in THREE sealed envelopes:
 *       1. Owner envelope    — key wrapped with PBKDF2(owner passphrase)
 *       2. Recovery envelope — key wrapped with PBKDF2(recovery code)
 *       3. Platform envelope — key wrapped with WILL_PLATFORM_MASTER_KEY (env)
 *
 *     Recovery code: generated once, emailed to all named executors, NEVER stored.
 *     Platform escrow: admin-only last resort, requires death cert verification.
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
import { sendEmail } from "../lib/mailer";

const router = Router();
export default router;

const ADMIN_IDS = () =>
  (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function getPlatformKey(): Buffer | null {
  const hex = process.env.WILL_PLATFORM_MASTER_KEY;
  if (!hex || hex.length !== 64) return null;
  try { return Buffer.from(hex, "hex"); } catch { return null; }
}

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

// ─── Crypto helpers ───────────────────────────────────────────────────────────

/** Wrap a 32-byte key with a passphrase (PBKDF2 → AES-256-GCM). */
function wrapKeyWithPassphrase(
  keyToWrap: Buffer,
  passphrase: string,
): { encrypted: string; iv: string; salt: string; authTag: string } {
  const salt = crypto.randomBytes(32);
  const wrapKey = crypto.pbkdf2Sync(passphrase, salt, 100_000, 32, "sha256");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", wrapKey, iv);
  const encrypted = Buffer.concat([cipher.update(keyToWrap), cipher.final()]);
  return {
    encrypted: encrypted.toString("base64"),
    iv:        iv.toString("hex"),
    salt:      salt.toString("hex"),
    authTag:   cipher.getAuthTag().toString("hex"),
  };
}

/** Unwrap a key that was wrapped with a passphrase. Throws on wrong passphrase. */
function unwrapKeyWithPassphrase(
  envelope: { encrypted: string; iv: string; salt: string; authTag: string },
  passphrase: string,
): Buffer {
  const wrapKey = crypto.pbkdf2Sync(passphrase, Buffer.from(envelope.salt, "hex"), 100_000, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", wrapKey, Buffer.from(envelope.iv, "hex"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.encrypted, "base64")),
    decipher.final(),
  ]);
}

/** Wrap a 32-byte key with a raw 32-byte platform key (AES-256-GCM). */
function wrapKeyWithRawKey(
  keyToWrap: Buffer,
  wrapKey: Buffer,
): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", wrapKey, iv);
  const encrypted = Buffer.concat([cipher.update(keyToWrap), cipher.final()]);
  return {
    encrypted: encrypted.toString("base64"),
    iv:        iv.toString("hex"),
    authTag:   cipher.getAuthTag().toString("hex"),
  };
}

/** Unwrap a key that was wrapped with a raw 32-byte platform key. */
function unwrapKeyWithRawKey(
  envelope: { encrypted: string; iv: string; authTag: string },
  wrapKey: Buffer,
): Buffer {
  const decipher = crypto.createDecipheriv("aes-256-gcm", wrapKey, Buffer.from(envelope.iv, "hex"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.encrypted, "base64")),
    decipher.final(),
  ]);
}

/** Encrypt content with a raw 32-byte key (AES-256-GCM). */
function encryptContentWithKey(content: string, contentKey: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", contentKey, iv);
  const encrypted = Buffer.concat([cipher.update(content, "utf8"), cipher.final()]);
  return {
    encryptedContent:  encrypted.toString("base64"),
    encryptionIv:      iv.toString("hex"),
    encryptionAuthTag: cipher.getAuthTag().toString("hex"),
  };
}

/** Decrypt content with a raw 32-byte key. */
function decryptContentWithKey(
  encryptedContent: string,
  iv: string,
  authTag: string,
  contentKey: Buffer,
): string {
  const decipher = crypto.createDecipheriv("aes-256-gcm", contentKey, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedContent, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * LEGACY: AES-256-GCM encryption where the content key is derived directly
 * from the passphrase. Used for existing ('passphrase' scheme) wills.
 */
function encryptContentLegacy(content: string, passphrase: string) {
  const encSalt = crypto.randomBytes(32);
  const key = crypto.pbkdf2Sync(passphrase, encSalt, 100_000, 32, "sha256");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(content, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const verSalt = crypto.randomBytes(32);
  const verifier = crypto.scryptSync(passphrase, verSalt, 64);
  return {
    contentKeyScheme:   "passphrase" as const,
    encryptedContent:   encrypted.toString("base64"),
    encryptionIv:       iv.toString("hex"),
    encryptionSalt:     encSalt.toString("hex"),
    encryptionAuthTag:  authTag.toString("hex"),
    passphraseVerifier: verifier.toString("hex"),
    passphraseSalt:     verSalt.toString("hex"),
  };
}

function verifyPassphrase(passphrase: string, verifier: string, salt: string): boolean {
  try {
    const computed = crypto.scryptSync(passphrase, Buffer.from(salt, "hex"), 64);
    return crypto.timingSafeEqual(computed, Buffer.from(verifier, "hex"));
  } catch { return false; }
}

/** LEGACY: decrypt content using passphrase-derived key. */
function decryptContentLegacy(
  encryptedContent: string, iv: string, salt: string, authTag: string, passphrase: string,
): string {
  const key = crypto.pbkdf2Sync(passphrase, Buffer.from(salt, "hex"), 100_000, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedContent, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * NEW split-key encryption.
 * Returns all DB fields PLUS the one-time recoveryCode (never stored).
 */
function encryptContentSplitKey(content: string, passphrase: string) {
  const contentKey = crypto.randomBytes(32);
  const { encryptedContent, encryptionIv, encryptionAuthTag } =
    encryptContentWithKey(content, contentKey);

  // Passphrase verifier (for fast pre-check)
  const verSalt = crypto.randomBytes(32);
  const verifier = crypto.scryptSync(passphrase, verSalt, 64);

  // Owner envelope
  const ownerEnv = wrapKeyWithPassphrase(contentKey, passphrase);

  // Recovery code
  const recoveryCode = crypto.randomBytes(24).toString("base64url");
  const recoveryEnv = wrapKeyWithPassphrase(contentKey, recoveryCode);

  // Platform envelope (if key available)
  const platformKey = getPlatformKey();
  const platformEnv = platformKey ? wrapKeyWithRawKey(contentKey, platformKey) : null;

  return {
    contentKeyScheme:    "split-key" as const,
    encryptedContent,
    encryptionIv,
    encryptionSalt:      crypto.randomBytes(32).toString("hex"), // placeholder for compat
    encryptionAuthTag,
    passphraseVerifier:  verifier.toString("hex"),
    passphraseSalt:      verSalt.toString("hex"),
    ownerKeyEnvelope:    JSON.stringify(ownerEnv),
    recoveryKeyEnvelope: JSON.stringify(recoveryEnv),
    platformKeyEnvelope: platformEnv ? JSON.stringify(platformEnv) : null,
    recoveryCode, // returned to caller, NEVER stored
  };
}

/** Strip all crypto + sensitive fields before sending will metadata to the client. */
function serializeWill(w: typeof genhalFamilyWillsTable.$inferSelect) {
  const {
    encryptedContent, encryptionIv, encryptionSalt, encryptionAuthTag,
    passphraseVerifier, passphraseSalt,
    ownerKeyEnvelope, recoveryKeyEnvelope, platformKeyEnvelope,
    ...meta
  } = w;

  const linkedAccountIds: number[] = (() => {
    try { return JSON.parse(meta.linkedAccountIds ?? "[]"); } catch { return []; }
  })();
  const executors: Array<{ name: string; email: string }> = (() => {
    try { return JSON.parse(meta.executors ?? "[]"); } catch { return []; }
  })();
  const authorizedPersons: Array<{ name: string; email: string; relationship: string }> = (() => {
    try { return JSON.parse(meta.authorizedPersons ?? "[]"); } catch { return []; }
  })();

  return {
    ...meta,
    authorizedPersons,
    linkedAccountIds,
    linkedAccountCount: linkedAccountIds.length,
    hasEncryptedContent: Boolean(encryptedContent),
    executors,
    hasRecovery: Boolean(recoveryKeyEnvelope),
    hasPlatformEscrow: Boolean(platformKeyEnvelope),
    adminUnlockPending: Boolean(meta.deathCertSubmittedAt && !meta.adminEscrowGrantedAt),
    adminUnlockGranted: Boolean(meta.adminEscrowGrantedAt),
  };
}

/** Fetch and attach linked secret accounts after decryption. */
async function fetchLinkedAccounts(linkedAccountIds: number[]) {
  if (linkedAccountIds.length === 0) return [];
  const accounts = await db
    .select()
    .from(genhalSecretAccountsTable)
    .where(inArray(genhalSecretAccountsTable.id, linkedAccountIds));
  return accounts.map((a) => ({
    id: a.id, currency: a.currency, provider: a.provider,
    accountNumber: a.accountNumber, accountName: a.accountName,
    bankName: a.bankName, routingNumber: a.routingNumber, isActive: a.isActive,
  }));
}

// ─── Email helper ─────────────────────────────────────────────────────────────

async function sendExecutorEmail(opts: {
  executorName: string;
  executorEmail: string;
  ownerName: string;
  recoveryCode: string;
}) {
  const { executorName, executorEmail, ownerName, recoveryCode } = opts;
  // Format as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX for readability
  const formatted = recoveryCode.match(/.{1,6}/g)?.join("-") ?? recoveryCode;
  const html = `
    <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#fafaf8;padding:32px;border-radius:12px;border:1px solid #e5e0d8">
      <div style="text-align:center;margin-bottom:24px">
        <h2 style="font-size:22px;color:#3d2b1f;margin:0">GenHaL — Will Executor Notice</h2>
        <p style="color:#7a6a5a;font-size:14px;margin:6px 0 0">Family Heritage & Legal Records</p>
      </div>
      <p style="font-size:16px;color:#3d2b1f">Dear <strong>${executorName}</strong>,</p>
      <p style="color:#5a4a3a;line-height:1.7">
        <strong>${ownerName}</strong> has named you as a <strong>Will Executor</strong> on
        the GenHaL Family Heritage Platform. This means you are entrusted to access
        their last will &amp; testament on their behalf when the time comes.
      </p>
      <div style="background:#fff8f0;border:2px solid #d97706;border-radius:10px;padding:20px;margin:24px 0;text-align:center">
        <p style="font-size:13px;color:#92400e;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px">
          🔐 Your Will Recovery Code
        </p>
        <p style="font-size:22px;font-family:monospace;letter-spacing:0.15em;color:#1c1917;margin:0 0 8px;word-break:break-all">
          ${formatted}
        </p>
        <p style="font-size:12px;color:#92400e;margin:0">
          This code is shown <strong>only once</strong> and is not stored by GenHaL.
        </p>
      </div>
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:20px">
        <p style="font-size:14px;color:#78350f;margin:0;line-height:1.6">
          <strong>⚠ Store this recovery code safely.</strong><br>
          Print it and keep it in a secure location, or store it in a password manager.
          If this code is lost and all other executors are also unavailable, a platform
          admin unlock (requiring death certificate verification) is the only remaining path.
        </p>
      </div>
      <p style="color:#5a4a3a;font-size:14px;line-height:1.7">
        <strong>How to use this code:</strong><br>
        When ${ownerName}'s family needs to access the will, go to the family's Will
        section on GenHaL and choose <em>"Executor Recovery"</em>. Enter this code
        when prompted. The will content will be decrypted and displayed.
      </p>
      <hr style="border:none;border-top:1px solid #e5e0d8;margin:24px 0">
      <p style="color:#9a8a7a;font-size:12px;text-align:center;margin:0">
        GenHaL — Genealogy · Heritage · Language<br>
        This is an automated notification. Do not reply to this email.
      </p>
    </div>
  `;
  await sendEmail({
    to: executorEmail,
    subject: `You are named as a will executor — Recovery Code Enclosed`,
    html,
  });
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /genhal/families/:id/wills
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
      .where(and(eq(genhalFamilyWillsTable.familyId, familyId), eq(genhalFamilyWillsTable.status, "active")))
      .orderBy(desc(genhalFamilyWillsTable.createdAt));
    res.json({ count: wills.length, currentUserClerkId: userId, wills: wills.map(serializeWill) });
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed to load wills" }); }
});

/**
 * GET /genhal/families/:id/wills/:willId
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
      .select().from(genhalFamilyWillsTable)
      .where(and(eq(genhalFamilyWillsTable.id, willId), eq(genhalFamilyWillsTable.familyId, familyId)));
    if (!will) return void res.status(404).json({ error: "Will not found" });
    res.json(serializeWill(will));
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed to load will" }); }
});

/**
 * POST /genhal/families/:id/wills
 * Create a new will.
 * If `executors` (array of {name, email}) are provided, uses the split-key
 * scheme, generates a recovery code, and emails each executor.
 */
router.post("/genhal/families/:id/wills", requireAuth(), async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const familyId = Number(req.params.id);
  const member = await resolveFamilyMember(familyId, userId);
  if (!member) return void res.status(403).json({ error: "Not a family member" });

  const { title, content, passphrase, summary, accessCondition, authorizedPersons, linkedAccountIds, executors } = req.body;
  if (!content)    return void res.status(400).json({ error: "Will content is required" });
  if (!passphrase) return void res.status(400).json({ error: "A passphrase is required to encrypt the will" });
  if (passphrase.length < 8) return void res.status(400).json({ error: "Passphrase must be at least 8 characters" });

  const validExecutors: Array<{ name: string; email: string }> = Array.isArray(executors)
    ? executors.filter((e: any) => e?.name && e?.email).slice(0, 5)
    : [];

  const [existing] = await db
    .select({ id: genhalFamilyWillsTable.id }).from(genhalFamilyWillsTable)
    .where(and(
      eq(genhalFamilyWillsTable.familyId, familyId),
      eq(genhalFamilyWillsTable.authorClerkId, userId),
      eq(genhalFamilyWillsTable.status, "active"),
    ));
  if (existing) return void res.status(409).json({ error: "You already have an active will. Update or revoke it first." });

  try {
    let encFields: Record<string, any>;
    let recoveryCode: string | null = null;

    if (validExecutors.length > 0) {
      const result = encryptContentSplitKey(content, passphrase);
      recoveryCode = result.recoveryCode;
      const { recoveryCode: _rc, ...rest } = result;
      encFields = rest;
    } else {
      encFields = encryptContentLegacy(content, passphrase);
    }

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
        executors: JSON.stringify(validExecutors),
        ...encFields,
        status: "active",
      })
      .returning();

    // Email all executors (best-effort, don't fail the request)
    if (recoveryCode && validExecutors.length > 0) {
      for (const ex of validExecutors) {
        sendExecutorEmail({
          executorName: ex.name,
          executorEmail: ex.email,
          ownerName: row.authorName,
          recoveryCode,
        }).catch((err) => logger.warn({ err, email: ex.email }, "[wills] failed to email executor"));
      }
    }

    if (!getPlatformKey()) {
      logger.warn("[wills] WILL_PLATFORM_MASTER_KEY not set — platform escrow unavailable for this will");
    }

    res.status(201).json({
      ...serializeWill(row),
      // Return recovery code ONCE — it is NEVER stored and cannot be recovered
      recoveryCode: recoveryCode ?? null,
    });
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed to create will" }); }
});

/**
 * PATCH /genhal/families/:id/wills/:willId
 * Update will metadata or content. Author only.
 * If `executors` provided, regenerates recovery codes and re-emails.
 */
router.patch("/genhal/families/:id/wills/:willId", requireAuth(), async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const familyId = Number(req.params.id);
  const willId   = Number(req.params.willId);

  const [will] = await db.select().from(genhalFamilyWillsTable)
    .where(and(eq(genhalFamilyWillsTable.id, willId), eq(genhalFamilyWillsTable.familyId, familyId)));
  if (!will) return void res.status(404).json({ error: "Will not found" });
  if (will.authorClerkId !== userId) return void res.status(403).json({ error: "Only the will author can modify it" });

  const { title, content, passphrase, summary, accessCondition, authorizedPersons, linkedAccountIds, executors } = req.body;
  let encFields: Record<string, any> = {};
  let recoveryCode: string | null = null;

  if (content !== undefined) {
    if (!passphrase) return void res.status(400).json({ error: "Passphrase required when updating will content" });
    if (passphrase.length < 8) return void res.status(400).json({ error: "Passphrase must be at least 8 characters" });

    const newExecutors: Array<{ name: string; email: string }> = Array.isArray(executors)
      ? executors.filter((e: any) => e?.name && e?.email).slice(0, 5)
      : ((() => { try { return JSON.parse(will.executors ?? "[]"); } catch { return []; } })());

    if (newExecutors.length > 0) {
      const result = encryptContentSplitKey(content, passphrase);
      recoveryCode = result.recoveryCode;
      const { recoveryCode: _rc, ...rest } = result;
      encFields = { ...rest, executors: JSON.stringify(newExecutors) };
    } else {
      encFields = { ...encryptContentLegacy(content, passphrase), executors: "[]" };
    }
  } else if (executors !== undefined) {
    // Just updating executor list (no content change) — keep existing encryption
    const validExecutors: Array<{ name: string; email: string }> = Array.isArray(executors)
      ? executors.filter((e: any) => e?.name && e?.email).slice(0, 5)
      : [];
    encFields = { executors: JSON.stringify(validExecutors) };
  }

  try {
    const [updated] = await db.update(genhalFamilyWillsTable).set({
      ...(title !== undefined ? { title } : {}),
      ...(summary !== undefined ? { summary } : {}),
      ...(accessCondition !== undefined ? { accessCondition } : {}),
      ...(authorizedPersons !== undefined ? { authorizedPersons: JSON.stringify(Array.isArray(authorizedPersons) ? authorizedPersons : []) } : {}),
      ...(linkedAccountIds !== undefined ? { linkedAccountIds: JSON.stringify(Array.isArray(linkedAccountIds) ? linkedAccountIds.map(Number).filter(Boolean) : []) } : {}),
      ...encFields,
      updatedAt: new Date(),
    }).where(eq(genhalFamilyWillsTable.id, willId)).returning();

    if (recoveryCode) {
      const execs: Array<{ name: string; email: string }> = (() => {
        try { return JSON.parse(updated.executors ?? "[]"); } catch { return []; }
      })();
      for (const ex of execs) {
        sendExecutorEmail({ executorName: ex.name, executorEmail: ex.email, ownerName: updated.authorName, recoveryCode })
          .catch((err) => logger.warn({ err }, "[wills] executor email failed"));
      }
    }

    res.json({ ...serializeWill(updated), recoveryCode: recoveryCode ?? null });
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed to update will" }); }
});

/**
 * DELETE /genhal/families/:id/wills/:willId
 */
router.delete("/genhal/families/:id/wills/:willId", requireAuth(), async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const familyId = Number(req.params.id);
  const willId   = Number(req.params.willId);
  const [will] = await db.select({ id: genhalFamilyWillsTable.id, authorClerkId: genhalFamilyWillsTable.authorClerkId })
    .from(genhalFamilyWillsTable)
    .where(and(eq(genhalFamilyWillsTable.id, willId), eq(genhalFamilyWillsTable.familyId, familyId)));
  if (!will) return void res.status(404).json({ error: "Will not found" });
  if (will.authorClerkId !== userId) return void res.status(403).json({ error: "Only the will author can revoke it" });
  try {
    await db.update(genhalFamilyWillsTable)
      .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(genhalFamilyWillsTable.id, willId));
    res.status(204).send();
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed to revoke will" }); }
});

/**
 * POST /genhal/families/:id/wills/:willId/access
 * Decrypt via owner passphrase. Works for both 'passphrase' and 'split-key' schemes.
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
    const [will] = await db.select().from(genhalFamilyWillsTable)
      .where(and(eq(genhalFamilyWillsTable.id, willId), eq(genhalFamilyWillsTable.familyId, familyId)));
    if (!will) return void res.status(404).json({ error: "Will not found" });
    if (will.status !== "active") return void res.status(410).json({ error: "This will has been revoked" });
    if (!will.encryptedContent || !will.encryptionIv || !will.encryptionAuthTag) {
      return void res.status(422).json({ error: "Will has no encrypted content" });
    }
    if (!will.passphraseVerifier || !will.passphraseSalt) {
      return void res.status(422).json({ error: "Will has no passphrase set" });
    }

    if (!verifyPassphrase(passphrase, will.passphraseVerifier, will.passphraseSalt)) {
      return void res.status(401).json({ error: "Incorrect passphrase" });
    }

    let content: string;
    try {
      if (will.contentKeyScheme === "split-key" && will.ownerKeyEnvelope) {
        const ownerEnv = JSON.parse(will.ownerKeyEnvelope);
        const contentKey = unwrapKeyWithPassphrase(ownerEnv, passphrase);
        content = decryptContentWithKey(will.encryptedContent, will.encryptionIv, will.encryptionAuthTag, contentKey);
      } else {
        content = decryptContentLegacy(will.encryptedContent, will.encryptionIv, will.encryptionSalt!, will.encryptionAuthTag, passphrase);
      }
    } catch { return void res.status(401).json({ error: "Decryption failed — passphrase may be incorrect" }); }

    const linkedAccountIds: number[] = (() => { try { return JSON.parse(will.linkedAccountIds ?? "[]"); } catch { return []; } })();
    res.json({
      willId: will.id, title: will.title, authorName: will.authorName,
      accessCondition: will.accessCondition, accessedAt: new Date().toISOString(),
      accessMethod: "passphrase", content,
      linkedAccounts: await fetchLinkedAccounts(linkedAccountIds),
    });
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed to access will" }); }
});

/**
 * POST /genhal/families/:id/wills/:willId/recovery-access
 * Decrypt via executor recovery code.
 * Requires authentication as a family member (the executor may or may not be the owner).
 */
router.post("/genhal/families/:id/wills/:willId/recovery-access", requireAuth(), async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const familyId = Number(req.params.id);
  const willId   = Number(req.params.willId);
  const member = await resolveFamilyMember(familyId, userId);
  if (!member) return void res.status(403).json({ error: "Not a family member" });

  const { recoveryCode } = req.body;
  if (!recoveryCode) return void res.status(400).json({ error: "Recovery code is required" });

  try {
    const [will] = await db.select().from(genhalFamilyWillsTable)
      .where(and(eq(genhalFamilyWillsTable.id, willId), eq(genhalFamilyWillsTable.familyId, familyId)));
    if (!will) return void res.status(404).json({ error: "Will not found" });
    if (will.status !== "active") return void res.status(410).json({ error: "This will has been revoked" });
    if (!will.recoveryKeyEnvelope) {
      return void res.status(422).json({ error: "This will has no executor recovery code set. Contact the will author." });
    }
    if (!will.encryptedContent || !will.encryptionIv || !will.encryptionAuthTag) {
      return void res.status(422).json({ error: "Will has no encrypted content" });
    }

    let content: string;
    try {
      const recoveryEnv = JSON.parse(will.recoveryKeyEnvelope);
      const contentKey = unwrapKeyWithPassphrase(recoveryEnv, recoveryCode.trim());
      content = decryptContentWithKey(will.encryptedContent, will.encryptionIv, will.encryptionAuthTag, contentKey);
    } catch {
      return void res.status(401).json({ error: "Incorrect recovery code" });
    }

    logger.info({ willId, userId }, "[wills] recovery code access");
    const linkedAccountIds: number[] = (() => { try { return JSON.parse(will.linkedAccountIds ?? "[]"); } catch { return []; } })();
    res.json({
      willId: will.id, title: will.title, authorName: will.authorName,
      accessCondition: will.accessCondition, accessedAt: new Date().toISOString(),
      accessMethod: "recovery", content,
      linkedAccounts: await fetchLinkedAccounts(linkedAccountIds),
    });
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed to access will via recovery code" }); }
});

/**
 * POST /genhal/families/:id/wills/:willId/request-unlock
 * Submit a death certificate URL and request admin escrow unlock.
 * Any authenticated family member can submit this (e.g. a surviving child).
 */
router.post("/genhal/families/:id/wills/:willId/request-unlock", requireAuth(), async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const familyId = Number(req.params.id);
  const willId   = Number(req.params.willId);
  const member = await resolveFamilyMember(familyId, userId);
  if (!member) return void res.status(403).json({ error: "Not a family member" });

  const { deathCertUrl } = req.body;
  if (!deathCertUrl) return void res.status(400).json({ error: "deathCertUrl is required" });

  try {
    const [will] = await db.select({ id: genhalFamilyWillsTable.id, platformKeyEnvelope: genhalFamilyWillsTable.platformKeyEnvelope })
      .from(genhalFamilyWillsTable)
      .where(and(eq(genhalFamilyWillsTable.id, willId), eq(genhalFamilyWillsTable.familyId, familyId)));
    if (!will) return void res.status(404).json({ error: "Will not found" });
    if (!will.platformKeyEnvelope) {
      return void res.status(422).json({ error: "This will was not created with platform escrow. The admin unlock path is unavailable." });
    }

    await db.update(genhalFamilyWillsTable).set({
      deathCertUrl,
      deathCertSubmittedAt: new Date(),
      deathCertSubmittedBy: userId,
      updatedAt: new Date(),
    }).where(eq(genhalFamilyWillsTable.id, willId));

    logger.info({ willId, userId }, "[wills] admin unlock requested");
    res.json({ ok: true, message: "Your request has been submitted. A platform admin will review the death certificate and grant access." });
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed to submit unlock request" }); }
});

/**
 * POST /genhal/families/:id/wills/:willId/escrow-access
 * Decrypt via platform master key. Only available after admin has granted access.
 * The clerk user making this request must match adminEscrowForClerk.
 */
router.post("/genhal/families/:id/wills/:willId/escrow-access", requireAuth(), async (req, res): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const familyId = Number(req.params.id);
  const willId   = Number(req.params.willId);
  const member = await resolveFamilyMember(familyId, userId);
  if (!member) return void res.status(403).json({ error: "Not a family member" });

  try {
    const [will] = await db.select().from(genhalFamilyWillsTable)
      .where(and(eq(genhalFamilyWillsTable.id, willId), eq(genhalFamilyWillsTable.familyId, familyId)));
    if (!will) return void res.status(404).json({ error: "Will not found" });
    if (!will.adminEscrowGrantedAt) {
      return void res.status(403).json({ error: "Admin unlock has not been granted. Submit a death certificate first." });
    }
    if (will.adminEscrowForClerk && will.adminEscrowForClerk !== userId) {
      return void res.status(403).json({ error: "Escrow access was granted to a different person" });
    }

    const platformKey = getPlatformKey();
    if (!platformKey) {
      return void res.status(503).json({ error: "Platform escrow is not configured. Contact support." });
    }
    if (!will.platformKeyEnvelope || !will.encryptedContent || !will.encryptionIv || !will.encryptionAuthTag) {
      return void res.status(422).json({ error: "Will is missing escrow data" });
    }

    let content: string;
    try {
      const platformEnv = JSON.parse(will.platformKeyEnvelope);
      const contentKey = unwrapKeyWithRawKey(platformEnv, platformKey);
      content = decryptContentWithKey(will.encryptedContent, will.encryptionIv, will.encryptionAuthTag, contentKey);
    } catch {
      return void res.status(500).json({ error: "Escrow decryption failed — contact support" });
    }

    logger.info({ willId, userId, grantedBy: will.adminEscrowGrantedBy }, "[wills] escrow access");
    const linkedAccountIds: number[] = (() => { try { return JSON.parse(will.linkedAccountIds ?? "[]"); } catch { return []; } })();
    res.json({
      willId: will.id, title: will.title, authorName: will.authorName,
      accessCondition: will.accessCondition, accessedAt: new Date().toISOString(),
      accessMethod: "platform-escrow", content,
      linkedAccounts: await fetchLinkedAccounts(linkedAccountIds),
    });
  } catch (err) { logger.error(err); res.status(500).json({ error: "Failed to access will via escrow" }); }
});

// ─── Admin routes ─────────────────────────────────────────────────────────────

/**
 * GET /genhal/admin/wills
 * List wills with pending death-cert unlock requests.
 */
router.get("/genhal/admin/wills", requireAuth(), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !ADMIN_IDS().includes(userId)) return void res.status(403).json({ error: "Admin only" });

  const wills = await db.select({
    id: genhalFamilyWillsTable.id,
    familyId: genhalFamilyWillsTable.familyId,
    authorName: genhalFamilyWillsTable.authorName,
    title: genhalFamilyWillsTable.title,
    deathCertUrl: genhalFamilyWillsTable.deathCertUrl,
    deathCertSubmittedAt: genhalFamilyWillsTable.deathCertSubmittedAt,
    deathCertSubmittedBy: genhalFamilyWillsTable.deathCertSubmittedBy,
    adminEscrowGrantedAt: genhalFamilyWillsTable.adminEscrowGrantedAt,
    adminEscrowGrantedBy: genhalFamilyWillsTable.adminEscrowGrantedBy,
    adminEscrowForClerk:  genhalFamilyWillsTable.adminEscrowForClerk,
    hasPlatformEnvelope:  genhalFamilyWillsTable.platformKeyEnvelope,
  }).from(genhalFamilyWillsTable)
    .where(eq(genhalFamilyWillsTable.status, "active"))
    .orderBy(desc(genhalFamilyWillsTable.deathCertSubmittedAt));

  res.json({
    wills: wills.map((w) => ({
      ...w,
      hasPlatformEnvelope: Boolean(w.hasPlatformEnvelope),
      deathCertSubmittedAt: w.deathCertSubmittedAt?.toISOString() ?? null,
      adminEscrowGrantedAt: w.adminEscrowGrantedAt?.toISOString() ?? null,
    })),
  });
});

/**
 * POST /genhal/admin/wills/:willId/grant-escrow
 * Admin approves the unlock request — sets adminEscrowGrantedAt and who may use it.
 * Body: { forClerkId: string }
 */
router.post("/genhal/admin/wills/:willId/grant-escrow", requireAuth(), async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId || !ADMIN_IDS().includes(userId)) return void res.status(403).json({ error: "Admin only" });

  const willId = Number(req.params.willId);
  const { forClerkId } = req.body;
  if (!forClerkId) return void res.status(400).json({ error: "forClerkId required" });

  const [will] = await db.select({ id: genhalFamilyWillsTable.id, platformKeyEnvelope: genhalFamilyWillsTable.platformKeyEnvelope })
    .from(genhalFamilyWillsTable).where(eq(genhalFamilyWillsTable.id, willId));
  if (!will) return void res.status(404).json({ error: "Will not found" });
  if (!will.platformKeyEnvelope) return void res.status(422).json({ error: "This will has no platform escrow envelope" });

  await db.update(genhalFamilyWillsTable).set({
    adminEscrowGrantedAt: new Date(),
    adminEscrowGrantedBy: userId,
    adminEscrowForClerk:  forClerkId,
    updatedAt: new Date(),
  }).where(eq(genhalFamilyWillsTable.id, willId));

  logger.info({ willId, grantedBy: userId, forClerkId }, "[wills] admin escrow granted");
  res.json({ ok: true });
});
