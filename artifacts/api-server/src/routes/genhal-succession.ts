/**
 * GenHaL Succession — next-of-kin and account succession for family accounts.
 *
 * GET    /genhal/families/:id/next-of-kin            — get next-of-kin settings
 * PATCH  /genhal/families/:id/next-of-kin            — update next-of-kin
 * POST   /genhal/families/:id/succession             — file a succession claim
 * POST   /genhal/families/:id/succession/upload-id   — presigned URL for ID document
 * POST   /genhal/families/:id/succession/confirm-id  — confirm ID upload
 * GET    /genhal/families/:id/succession/claims      — list succession claims
 * PATCH  /genhal/families/:id/succession/:claimId    — admin: approve or reject
 */
import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  genhalFamilyAccountsTable,
  genhalFamilyMembersTable,
  genhalSuccessionClaimsTable,
} from "@workspace/db";
import { isR2Configured, generateR2Key, createUploadUrl } from "../lib/genhal-r2";
import {
  sendSuccessionClaimFiledEmails,
  sendSuccessionApprovedEmails,
  sendSuccessionRejectedEmail,
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

async function getFamily(familyId: number) {
  const [f] = await db.select().from(genhalFamilyAccountsTable)
    .where(eq(genhalFamilyAccountsTable.id, familyId)).limit(1);
  return f ?? null;
}

// ── GET /genhal/families/:id/next-of-kin ──────────────────────────────────────

router.get("/genhal/families/:id/next-of-kin", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  const familyId = Number(req.params.id);
  const family = await getFamily(familyId);
  if (!family) { res.status(404).json({ error: "Family not found" }); return; }

  const isFamilyHead = family.clerkUserId === userId;
  const [member] = await db.select({ role: genhalFamilyMembersTable.role })
    .from(genhalFamilyMembersTable)
    .where(and(
      eq(genhalFamilyMembersTable.familyId, familyId),
      eq(genhalFamilyMembersTable.clerkUserId, userId),
      eq(genhalFamilyMembersTable.status, "active"),
    )).limit(1);
  const canView = isFamilyHead || (member && ["head","co_head","elder"].includes(member.role)) || isAdmin(userId);
  if (!canView) { res.status(403).json({ error: "Forbidden" }); return; }

  res.json({
    nextOfKinName:         family.nextOfKinName,
    nextOfKinEmail:        family.nextOfKinEmail,
    nextOfKinPhone:        family.nextOfKinPhone,
    nextOfKinRelationship: family.nextOfKinRelationship,
    nextOfKinNotes:        family.nextOfKinNotes,
  });
});

// ── PATCH /genhal/families/:id/next-of-kin ────────────────────────────────────

router.patch("/genhal/families/:id/next-of-kin", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  const familyId = Number(req.params.id);
  const family = await getFamily(familyId);
  if (!family) { res.status(404).json({ error: "Family not found" }); return; }
  if (family.clerkUserId !== userId && !isAdmin(userId)) {
    res.status(403).json({ error: "Only the family head or an admin can set the next of kin" }); return;
  }

  const { nextOfKinName, nextOfKinEmail, nextOfKinPhone, nextOfKinRelationship, nextOfKinNotes } =
    req.body as {
      nextOfKinName?: string; nextOfKinEmail?: string; nextOfKinPhone?: string;
      nextOfKinRelationship?: string; nextOfKinNotes?: string;
    };

  await db.update(genhalFamilyAccountsTable).set({
    nextOfKinName:         nextOfKinName ?? null,
    nextOfKinEmail:        nextOfKinEmail ?? null,
    nextOfKinPhone:        nextOfKinPhone ?? null,
    nextOfKinRelationship: nextOfKinRelationship ?? null,
    nextOfKinNotes:        nextOfKinNotes ?? null,
    updatedAt: new Date(),
  }).where(eq(genhalFamilyAccountsTable.id, familyId));

  res.json({ success: true });
});

// ── POST /genhal/families/:id/succession ──────────────────────────────────────
// File a succession claim (I am the named successor and wish to take over).

router.post("/genhal/families/:id/succession", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  const familyId = Number(req.params.id);
  const family = await getFamily(familyId);
  if (!family) { res.status(404).json({ error: "Family not found" }); return; }

  const { claimerName, claimerEmail, claimerPhone, relationshipToOwner, statement } =
    req.body as {
      claimerName: string; claimerEmail: string; claimerPhone?: string;
      relationshipToOwner: string; statement?: string;
    };
  if (!claimerName || !claimerEmail || !relationshipToOwner) {
    res.status(400).json({ error: "claimerName, claimerEmail, and relationshipToOwner are required" }); return;
  }

  const [claim] = await db.insert(genhalSuccessionClaimsTable).values({
    familyId,
    claimerClerkUserId:  userId,
    claimerName,
    claimerEmail,
    claimerPhone:         claimerPhone ?? null,
    relationshipToOwner,
    statement:            statement ?? null,
    status:               "pending",
  }).returning();

  res.status(201).json(claim);

  // Best-effort alert to family head + admins (after response)
  sendSuccessionClaimFiledEmails({
    familyId,
    familyName: family.name,
    familyHeadClerkUserId: family.clerkUserId,
    claimerName,
    claimerEmail,
    relationshipToOwner,
    claimId: claim.id,
  }).catch(() => {});
});

// ── POST /genhal/families/:id/succession/upload-id ────────────────────────────
// Get a presigned PUT URL to upload a government ID document for the succession claim.

router.post("/genhal/families/:id/succession/upload-id", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  if (!isR2Configured()) { res.status(503).json({ error: "Storage not configured" }); return; }

  const familyId = Number(req.params.id);
  const { claimId, fileName, mimeType } = req.body as {
    claimId: number; fileName: string; mimeType: string;
  };
  if (!claimId || !fileName || !mimeType) {
    res.status(400).json({ error: "claimId, fileName, and mimeType are required" }); return;
  }

  const [claim] = await db.select().from(genhalSuccessionClaimsTable)
    .where(and(
      eq(genhalSuccessionClaimsTable.id, Number(claimId)),
      eq(genhalSuccessionClaimsTable.familyId, familyId),
    )).limit(1);
  if (!claim) { res.status(404).json({ error: "Claim not found" }); return; }
  if (claim.claimerClerkUserId !== userId && !isAdmin(userId)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const r2Key = generateR2Key(`succession/${familyId}`, fileName);
  const uploadUrl = await createUploadUrl(r2Key, mimeType, 900);

  await db.update(genhalSuccessionClaimsTable).set({
    idR2Key: r2Key, idFilename: fileName, idUploadStatus: "pending",
  }).where(eq(genhalSuccessionClaimsTable.id, Number(claimId)));

  res.json({ uploadUrl, r2Key });
});

// ── POST /genhal/families/:id/succession/confirm-id ──────────────────────────

router.post("/genhal/families/:id/succession/confirm-id", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  const { claimId } = req.body as { claimId: number };
  if (!claimId) { res.status(400).json({ error: "claimId required" }); return; }

  await db.update(genhalSuccessionClaimsTable)
    .set({ idUploadStatus: "complete", updatedAt: new Date() })
    .where(eq(genhalSuccessionClaimsTable.id, Number(claimId)));

  res.json({ success: true });
});

// ── GET /genhal/families/:id/succession/claims ────────────────────────────────

router.get("/genhal/families/:id/succession/claims", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  const familyId = Number(req.params.id);
  const family = await getFamily(familyId);
  if (!family) { res.status(404).json({ error: "Family not found" }); return; }

  const canSeeAll = family.clerkUserId === userId || isAdmin(userId);
  const claims = canSeeAll
    ? await db.select().from(genhalSuccessionClaimsTable)
        .where(eq(genhalSuccessionClaimsTable.familyId, familyId))
        .orderBy(desc(genhalSuccessionClaimsTable.createdAt))
    : await db.select().from(genhalSuccessionClaimsTable)
        .where(and(
          eq(genhalSuccessionClaimsTable.familyId, familyId),
          eq(genhalSuccessionClaimsTable.claimerClerkUserId, userId),
        )).orderBy(desc(genhalSuccessionClaimsTable.createdAt));

  res.json(claims);
});

// ── PATCH /genhal/families/:id/succession/:claimId ────────────────────────────
// Admin: approve or reject. Approval transfers family account ownership.

router.patch("/genhal/families/:id/succession/:claimId", async (req, res): Promise<void> => {
  const userId = requireUserId(req, res); if (!userId) return;
  if (!isAdmin(userId)) { res.status(403).json({ error: "Admin only" }); return; }

  const familyId = Number(req.params.id);
  const claimId  = Number(req.params.claimId);
  const { status, adminNotes } = req.body as { status: string; adminNotes?: string };
  if (!["pending","under_review","approved","rejected"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }

  const [claim] = await db.select().from(genhalSuccessionClaimsTable)
    .where(and(
      eq(genhalSuccessionClaimsTable.id, claimId),
      eq(genhalSuccessionClaimsTable.familyId, familyId),
    )).limit(1);
  if (!claim) { res.status(404).json({ error: "Claim not found" }); return; }

  if (status === "approved") {
    // Transfer family account ownership to claimer
    await db.update(genhalFamilyAccountsTable)
      .set({ clerkUserId: claim.claimerClerkUserId, updatedAt: new Date() })
      .where(eq(genhalFamilyAccountsTable.id, familyId));

    // Upsert as family head
    const [existing] = await db.select({ id: genhalFamilyMembersTable.id })
      .from(genhalFamilyMembersTable)
      .where(and(
        eq(genhalFamilyMembersTable.familyId, familyId),
        eq(genhalFamilyMembersTable.clerkUserId, claim.claimerClerkUserId),
      )).limit(1);
    if (existing) {
      await db.update(genhalFamilyMembersTable)
        .set({ role: "head", status: "active", updatedAt: new Date() })
        .where(eq(genhalFamilyMembersTable.id, existing.id));
    } else {
      await db.insert(genhalFamilyMembersTable).values({
        familyId,
        clerkUserId: claim.claimerClerkUserId,
        role: "head",
        status: "active",
      });
    }
  }

  const [updated] = await db.update(genhalSuccessionClaimsTable).set({
    status,
    adminNotes: adminNotes ?? null,
    reviewedByClerkUserId: userId,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(genhalSuccessionClaimsTable.id, claimId)).returning();

  res.json(updated);

  // Best-effort email after response
  if (status === "approved") {
    sendSuccessionApprovedEmails({
      familyId,
      familyName: family?.name ?? `Family #${familyId}`,
      claimerName: claim.claimerName,
      claimerEmail: claim.claimerEmail,
      adminNotes: adminNotes ?? undefined,
      claimId,
    }).catch(() => {});
  } else if (status === "rejected") {
    sendSuccessionRejectedEmail({
      familyName: family?.name ?? `Family #${familyId}`,
      claimerEmail: claim.claimerEmail,
      adminNotes: adminNotes ?? undefined,
    }).catch(() => {});
  }
});

export default router;
