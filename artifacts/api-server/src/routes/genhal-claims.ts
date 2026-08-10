/**
 * GenHaL Ownership Claims — dispute & transfer for kingdoms, families, compounds.
 *
 * POST   /genhal/claims                            — file a new claim
 * GET    /genhal/claims/mine                       — user's own claims
 * GET    /genhal/claims/admin                      — all claims (admin)
 * GET    /genhal/claims/:id                        — single claim + evidence
 * POST   /genhal/claims/:id/evidence/upload-url    — presigned upload URL for evidence file
 * POST   /genhal/claims/:id/evidence/confirm       — mark evidence upload complete
 * DELETE /genhal/claims/:id/evidence/:eid          — remove evidence
 * PATCH  /genhal/claims/:id/status                 — admin: change status / approve / reject
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  genhalOwnershipClaimsTable,
  genhalClaimEvidenceTable,
  genhalKingdomsTable,
  genhalFamilyAccountsTable,
  genhalKingdomMembersTable,
  genhalFamilyMembersTable,
} from "@workspace/db";
import { isR2Configured, generateR2Key, createUploadUrl, deleteObject } from "../lib/genhal-r2";
import {
  sendClaimFiledEmails,
  sendClaimStatusEmails,
} from "../lib/genhal-emails";

const router = Router();

function isAdmin(userId: string) {
  return (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean).includes(userId);
}

function requireUserId(req: import("express").Request, res: import("express").Response): string | null {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  return userId;
}

// ── POST /genhal/claims ───────────────────────────────────────────────────────

router.post("/genhal/claims", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  const { unitType, unitId, position, claimantName, claimantEmail, claimantPhone, claimReason } =
    req.body as {
      unitType: string; unitId: number; position: string;
      claimantName: string; claimantEmail: string; claimantPhone?: string;
      claimReason: string;
    };

  const missing = ["unitType","unitId","position","claimantName","claimantEmail","claimReason"]
    .filter(k => !(req.body as Record<string, unknown>)[k]);
  if (missing.length) { res.status(400).json({ error: `Missing: ${missing.join(", ")}` }); return; }
  if (!["kingdom","family","compound"].includes(unitType)) {
    res.status(400).json({ error: "unitType must be kingdom, family, or compound" }); return;
  }

  const [claim] = await db.insert(genhalOwnershipClaimsTable).values({
    unitType, unitId: Number(unitId), position,
    claimantClerkUserId: userId,
    claimantName, claimantEmail,
    claimantPhone: claimantPhone ?? null,
    claimReason,
    status: "pending",
  }).returning();

  res.status(201).json(claim);

  // Resolve current owner and unit name for email alert (best-effort, after response)
  (async () => {
    try {
      let ownerClerkUserId: string | null = null;
      let unitName = `${unitType} #${unitId}`;
      if (unitType === "kingdom") {
        const [k] = await db.select({ clerkUserId: genhalKingdomsTable.clerkUserId, name: genhalKingdomsTable.name })
          .from(genhalKingdomsTable).where(eq(genhalKingdomsTable.id, Number(unitId))).limit(1);
        ownerClerkUserId = k?.clerkUserId ?? null;
        unitName = k?.name ?? unitName;
      } else if (unitType === "family") {
        const [f] = await db.select({ clerkUserId: genhalFamilyAccountsTable.clerkUserId, name: genhalFamilyAccountsTable.name })
          .from(genhalFamilyAccountsTable).where(eq(genhalFamilyAccountsTable.id, Number(unitId))).limit(1);
        ownerClerkUserId = f?.clerkUserId ?? null;
        unitName = f?.name ?? unitName;
      }
      if (ownerClerkUserId) {
        await sendClaimFiledEmails({
          unitType, unitId: Number(unitId), unitName,
          ownerClerkUserId, claimantName, claimantEmail,
          position, claimId: claim.id,
        });
      }
    } catch { /* already best-effort */ }
  })();
});

// ── GET /genhal/claims/mine ───────────────────────────────────────────────────

router.get("/genhal/claims/mine", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  const claims = await db.select().from(genhalOwnershipClaimsTable)
    .where(eq(genhalOwnershipClaimsTable.claimantClerkUserId, userId))
    .orderBy(desc(genhalOwnershipClaimsTable.createdAt));
  res.json(claims);
});

// ── GET /genhal/claims/admin ──────────────────────────────────────────────────

router.get("/genhal/claims/admin", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin only" }); return; }
  const claims = await db.select().from(genhalOwnershipClaimsTable)
    .orderBy(desc(genhalOwnershipClaimsTable.createdAt));
  res.json(claims);
});

// ── GET /genhal/claims/unit/:unitType/:unitId ─────────────────────────────────
// Returns claims for a specific unit. Claimants see only their own; owner+admin see all.

router.get("/genhal/claims/unit/:unitType/:unitId", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  const unitType = req.params.unitType;
  const unitId = Number(req.params.unitId);

  // Determine if user is the owner of this unit
  let isOwner = false;
  if (unitType === "kingdom") {
    const [k] = await db.select({ clerkUserId: genhalKingdomsTable.clerkUserId })
      .from(genhalKingdomsTable).where(eq(genhalKingdomsTable.id, unitId)).limit(1);
    isOwner = k?.clerkUserId === userId;
  } else if (unitType === "family") {
    const [f] = await db.select({ clerkUserId: genhalFamilyAccountsTable.clerkUserId })
      .from(genhalFamilyAccountsTable).where(eq(genhalFamilyAccountsTable.id, unitId)).limit(1);
    isOwner = f?.clerkUserId === userId;
  }

  const canSeeAll = isOwner || isAdmin(userId);
  const claims = canSeeAll
    ? await db.select().from(genhalOwnershipClaimsTable)
        .where(and(
          eq(genhalOwnershipClaimsTable.unitType, unitType),
          eq(genhalOwnershipClaimsTable.unitId, unitId),
        )).orderBy(desc(genhalOwnershipClaimsTable.createdAt))
    : await db.select().from(genhalOwnershipClaimsTable)
        .where(and(
          eq(genhalOwnershipClaimsTable.unitType, unitType),
          eq(genhalOwnershipClaimsTable.unitId, unitId),
          eq(genhalOwnershipClaimsTable.claimantClerkUserId, userId),
        )).orderBy(desc(genhalOwnershipClaimsTable.createdAt));

  res.json(claims);
});

// ── GET /genhal/claims/:id ────────────────────────────────────────────────────

router.get("/genhal/claims/:id", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  const claimId = Number(req.params.id);
  const [claim] = await db.select().from(genhalOwnershipClaimsTable)
    .where(eq(genhalOwnershipClaimsTable.id, claimId)).limit(1);
  if (!claim) { res.status(404).json({ error: "Not found" }); return; }
  if (claim.claimantClerkUserId !== userId && !isAdmin(userId)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const evidence = await db.select().from(genhalClaimEvidenceTable)
    .where(eq(genhalClaimEvidenceTable.claimId, claimId))
    .orderBy(genhalClaimEvidenceTable.createdAt);
  res.json({ ...claim, evidence });
});

// ── POST /genhal/claims/:id/evidence/upload-url ───────────────────────────────

router.post("/genhal/claims/:id/evidence/upload-url", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  if (!isR2Configured()) { res.status(503).json({ error: "Storage not configured" }); return; }

  const claimId = Number(req.params.id);
  const [claim] = await db.select({ id: genhalOwnershipClaimsTable.id, claimantClerkUserId: genhalOwnershipClaimsTable.claimantClerkUserId })
    .from(genhalOwnershipClaimsTable).where(eq(genhalOwnershipClaimsTable.id, claimId)).limit(1);
  if (!claim) { res.status(404).json({ error: "Claim not found" }); return; }
  if (claim.claimantClerkUserId !== userId && !isAdmin(userId)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { fileName, mimeType, evidenceType, description } = req.body as {
    fileName: string; mimeType: string; evidenceType?: string; description?: string;
  };
  if (!fileName || !mimeType) { res.status(400).json({ error: "fileName and mimeType required" }); return; }

  const r2Key = generateR2Key(`claims/${claimId}`, fileName);
  const uploadUrl = await createUploadUrl(r2Key, mimeType, 900);

  const [evidence] = await db.insert(genhalClaimEvidenceTable).values({
    claimId,
    evidenceType: evidenceType ?? "document",
    r2Key,
    fileName,
    mimeType,
    uploadStatus: "pending",
    description: description ?? null,
  }).returning();

  res.json({ uploadUrl, evidence });
});

// ── POST /genhal/claims/:id/evidence/confirm ──────────────────────────────────

router.post("/genhal/claims/:id/evidence/confirm", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  const { evidenceId, fileSize } = req.body as { evidenceId: number; fileSize?: number };
  if (!evidenceId) { res.status(400).json({ error: "evidenceId required" }); return; }

  await db.update(genhalClaimEvidenceTable).set({
    uploadStatus: "complete",
    fileSizeBytes: fileSize ?? null,
  }).where(eq(genhalClaimEvidenceTable.id, Number(evidenceId)));

  res.json({ success: true });
});

// ── DELETE /genhal/claims/:id/evidence/:eid ───────────────────────────────────

router.delete("/genhal/claims/:id/evidence/:eid", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  const eid = Number(req.params.eid);

  const [ev] = await db.select().from(genhalClaimEvidenceTable)
    .where(eq(genhalClaimEvidenceTable.id, eid)).limit(1);
  if (!ev) { res.status(404).json({ error: "Not found" }); return; }

  if (ev.r2Key) {
    try { await deleteObject(ev.r2Key); } catch { /* ignore */ }
  }
  await db.delete(genhalClaimEvidenceTable).where(eq(genhalClaimEvidenceTable.id, eid));
  res.json({ success: true });
});

// ── PATCH /genhal/claims/:id/status ──────────────────────────────────────────
// Admin: change status. On "approved", transfer ownership to claimant.

router.patch("/genhal/claims/:id/status", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin only" }); return; }

  const claimId = Number(req.params.id);
  const { status, adminNotes } = req.body as { status: string; adminNotes?: string };
  if (!["pending","under_review","approved","rejected"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }

  const [claim] = await db.select().from(genhalOwnershipClaimsTable)
    .where(eq(genhalOwnershipClaimsTable.id, claimId)).limit(1);
  if (!claim) { res.status(404).json({ error: "Claim not found" }); return; }

  // Transfer ownership on approval
  if (status === "approved") {
    if (claim.unitType === "kingdom") {
      await db.update(genhalKingdomsTable)
        .set({ clerkUserId: claim.claimantClerkUserId, updatedAt: new Date() })
        .where(eq(genhalKingdomsTable.id, claim.unitId));

      // Upsert as king-level member
      const [existing] = await db.select({ id: genhalKingdomMembersTable.id })
        .from(genhalKingdomMembersTable)
        .where(and(
          eq(genhalKingdomMembersTable.kingdomId, claim.unitId),
          eq(genhalKingdomMembersTable.clerkUserId, claim.claimantClerkUserId),
        )).limit(1);
      if (existing) {
        await db.update(genhalKingdomMembersTable)
          .set({ role: "king", status: "active", updatedAt: new Date() })
          .where(eq(genhalKingdomMembersTable.id, existing.id));
      } else {
        await db.insert(genhalKingdomMembersTable).values({
          kingdomId: claim.unitId,
          clerkUserId: claim.claimantClerkUserId,
          role: "king",
          status: "active",
        });
      }
    } else if (claim.unitType === "family") {
      await db.update(genhalFamilyAccountsTable)
        .set({ clerkUserId: claim.claimantClerkUserId, updatedAt: new Date() })
        .where(eq(genhalFamilyAccountsTable.id, claim.unitId));

      const [existing] = await db.select({ id: genhalFamilyMembersTable.id })
        .from(genhalFamilyMembersTable)
        .where(and(
          eq(genhalFamilyMembersTable.familyId, claim.unitId),
          eq(genhalFamilyMembersTable.clerkUserId, claim.claimantClerkUserId),
        )).limit(1);
      if (existing) {
        await db.update(genhalFamilyMembersTable)
          .set({ role: "head", status: "active", updatedAt: new Date() })
          .where(eq(genhalFamilyMembersTable.id, existing.id));
      } else {
        await db.insert(genhalFamilyMembersTable).values({
          familyId: claim.unitId,
          clerkUserId: claim.claimantClerkUserId,
          role: "head",
          status: "active",
        });
      }
    }
  }

  const [updated] = await db.update(genhalOwnershipClaimsTable).set({
    status,
    adminNotes: adminNotes ?? null,
    reviewedByClerkUserId: userId,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(genhalOwnershipClaimsTable.id, claimId)).returning();

  res.json(updated);

  // Send status-change emails after the response is delivered (best-effort)
  (async () => {
    try {
      let unitName = `${claim.unitType} #${claim.unitId}`;
      let formerOwnerClerkUserId: string | undefined;
      if (claim.unitType === "kingdom") {
        const [k] = await db.select({ clerkUserId: genhalKingdomsTable.clerkUserId, name: genhalKingdomsTable.name })
          .from(genhalKingdomsTable).where(eq(genhalKingdomsTable.id, claim.unitId)).limit(1);
        unitName = k?.name ?? unitName;
        // On approval, ownership already transferred — former owner was k.clerkUserId before update
        formerOwnerClerkUserId = status === "approved" ? k?.clerkUserId : undefined;
      } else if (claim.unitType === "family") {
        const [f] = await db.select({ clerkUserId: genhalFamilyAccountsTable.clerkUserId, name: genhalFamilyAccountsTable.name })
          .from(genhalFamilyAccountsTable).where(eq(genhalFamilyAccountsTable.id, claim.unitId)).limit(1);
        unitName = f?.name ?? unitName;
        formerOwnerClerkUserId = status === "approved" ? f?.clerkUserId : undefined;
      }
      await sendClaimStatusEmails({
        status,
        claimantClerkUserId: claim.claimantClerkUserId,
        claimantEmail: claim.claimantEmail,
        claimantName: claim.claimantName,
        unitType: claim.unitType,
        unitId: claim.unitId,
        unitName,
        position: claim.position,
        adminNotes: adminNotes ?? undefined,
        claimId: claim.id,
        formerOwnerClerkUserId,
      });
    } catch { /* best-effort */ }
  })();
});

export default router;
