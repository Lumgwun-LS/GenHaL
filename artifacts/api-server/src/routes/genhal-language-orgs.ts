/**
 * Language Organisation routes.
 *
 * Public:
 *   GET  /genhal/language-orgs              — list approved orgs (with language list)
 *   GET  /genhal/language-orgs/:id          — org public profile
 *
 * Authenticated (org member):
 *   POST /genhal/language-orgs              — register a new org (pending approval)
 *   GET  /genhal/language-orgs/:id/me       — caller's membership in this org
 *   PATCH /genhal/language-orgs/:id         — update org details (admin/owner)
 *   POST /genhal/language-orgs/:id/members  — invite a member (admin/owner)
 *   GET  /genhal/language-orgs/:id/members  — list members (any member)
 *   PATCH /genhal/language-orgs/:id/members/:mid — change role/status (admin/owner)
 *   DELETE /genhal/language-orgs/:id/members/:mid — remove member (admin/owner)
 *   POST /genhal/language-orgs/:id/languages — add a managed language (admin/owner)
 *   PATCH /genhal/language-orgs/:id/languages/:code — toggle requires_approval (admin/owner)
 *   DELETE /genhal/language-orgs/:id/languages/:code — remove language (admin/owner)
 *   GET  /genhal/language-orgs/:id/pending-datasets — datasets awaiting review (reviewer+)
 *   POST /genhal/language-orgs/:id/datasets/:datasetId/review — approve or reject (reviewer+)
 *
 * Admin:
 *   GET  /genhal/admin/language-orgs        — all orgs (any status)
 *   PATCH /genhal/admin/language-orgs/:id   — approve / reject / suspend org
 */

import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth, getAuth } from "@clerk/express";
import {
  db,
  genhalLanguageOrgsTable,
  genhalLanguageOrgMembersTable,
  genhalLanguageOrgLanguagesTable,
  genhalLanguageDatasetsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();
export default router;

const ADMIN_IDS = () =>
  (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

// ─── helpers ─────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function getMembership(orgId: number, clerkUserId: string) {
  const [m] = await db
    .select()
    .from(genhalLanguageOrgMembersTable)
    .where(
      and(
        eq(genhalLanguageOrgMembersTable.orgId, orgId),
        eq(genhalLanguageOrgMembersTable.clerkUserId, clerkUserId),
        eq(genhalLanguageOrgMembersTable.status, "active"),
      ),
    )
    .limit(1);
  return m ?? null;
}

const CAN_MANAGE = ["owner", "admin"] as const;
const CAN_REVIEW = ["owner", "admin", "reviewer"] as const;

function canManage(role: string) { return (CAN_MANAGE as readonly string[]).includes(role); }
function canReview(role: string) { return (CAN_REVIEW as readonly string[]).includes(role); }

// ─── Public: list approved orgs ──────────────────────────────────────────────
router.get("/genhal/language-orgs", async (_req, res) => {
  const orgs = await db
    .select({
      id: genhalLanguageOrgsTable.id,
      name: genhalLanguageOrgsTable.name,
      slug: genhalLanguageOrgsTable.slug,
      description: genhalLanguageOrgsTable.description,
      logoUrl: genhalLanguageOrgsTable.logoUrl,
      website: genhalLanguageOrgsTable.website,
      country: genhalLanguageOrgsTable.country,
      foundedYear: genhalLanguageOrgsTable.foundedYear,
      createdAt: genhalLanguageOrgsTable.createdAt,
      memberCount: sql<number>`(
        SELECT COUNT(*) FROM genhal_language_org_members
        WHERE org_id = ${genhalLanguageOrgsTable.id} AND status = 'active'
      )`,
      languageCodes: sql<string[]>`(
        SELECT COALESCE(json_agg(language_code), '[]'::json)
        FROM genhal_language_org_languages
        WHERE org_id = ${genhalLanguageOrgsTable.id}
      )`,
    })
    .from(genhalLanguageOrgsTable)
    .where(eq(genhalLanguageOrgsTable.status, "approved"))
    .orderBy(genhalLanguageOrgsTable.name);

  res.json({ orgs });
});

// ─── Public: org profile ─────────────────────────────────────────────────────
router.get("/genhal/language-orgs/:id", async (req, res) => {
  const orgId = Number(req.params.id);
  if (isNaN(orgId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [org] = await db
    .select()
    .from(genhalLanguageOrgsTable)
    .where(eq(genhalLanguageOrgsTable.id, orgId))
    .limit(1);

  if (!org) { res.status(404).json({ error: "Not found" }); return; }

  const [languages, members] = await Promise.all([
    db.select().from(genhalLanguageOrgLanguagesTable)
      .where(eq(genhalLanguageOrgLanguagesTable.orgId, orgId)),
    db.select({
      id: genhalLanguageOrgMembersTable.id,
      clerkUserId: genhalLanguageOrgMembersTable.clerkUserId,
      role: genhalLanguageOrgMembersTable.role,
      joinedAt: genhalLanguageOrgMembersTable.joinedAt,
    })
      .from(genhalLanguageOrgMembersTable)
      .where(
        and(
          eq(genhalLanguageOrgMembersTable.orgId, orgId),
          eq(genhalLanguageOrgMembersTable.status, "active"),
        ),
      ),
  ]);

  res.json({
    org: serializeOrg(org),
    languages: languages.map((l) => ({
      languageCode: l.languageCode,
      requiresApproval: l.requiresApproval,
      isPrimaryOrg: l.isPrimaryOrg,
    })),
    members: members.map((m) => ({
      id: m.id,
      clerkUserId: m.clerkUserId,
      role: m.role,
      joinedAt: m.joinedAt?.toISOString() ?? null,
    })),
  });
});

// ─── Authenticated: register org ─────────────────────────────────────────────
router.post("/genhal/language-orgs", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { name, description, logoUrl, website, contactEmail, country, foundedYear } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }

  let slug = slugify(name);
  // Ensure uniqueness
  const existing = await db
    .select({ slug: genhalLanguageOrgsTable.slug })
    .from(genhalLanguageOrgsTable)
    .where(sql`slug LIKE ${slug + "%"}`)
    .limit(10);
  if (existing.length > 0) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  const [org] = await db
    .insert(genhalLanguageOrgsTable)
    .values({
      name: name.trim(),
      slug,
      description: description?.trim() || null,
      logoUrl: logoUrl?.trim() || null,
      website: website?.trim() || null,
      contactEmail: contactEmail?.trim() || null,
      country: country?.trim() || null,
      foundedYear: foundedYear ? Number(foundedYear) : null,
      clerkUserId: userId,
      status: "pending",
    })
    .returning();

  // Auto-add founder as owner
  await db.insert(genhalLanguageOrgMembersTable).values({
    orgId: org.id,
    clerkUserId: userId,
    role: "owner",
    status: "active",
  });

  logger.info({ orgId: org.id, userId }, "[lang-orgs] new org registered");
  res.status(201).json({ org: serializeOrg(org) });
});

// ─── Authenticated: get my membership ────────────────────────────────────────
router.get("/genhal/language-orgs/:id/me", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const orgId = Number(req.params.id);
  const m = await getMembership(orgId, userId);
  res.json({ membership: m ? { role: m.role, status: m.status } : null });
});

// ─── Authenticated: update org ────────────────────────────────────────────────
router.patch("/genhal/language-orgs/:id", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const orgId = Number(req.params.id);

  const m = await getMembership(orgId, userId);
  if (!m || !canManage(m.role)) {
    res.status(403).json({ error: "Only org admins can update org details" }); return;
  }

  const { name, description, logoUrl, website, contactEmail, country, foundedYear } = req.body;
  const updates: Partial<typeof genhalLanguageOrgsTable.$inferInsert> = { updatedAt: new Date() };
  if (name) updates.name = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (logoUrl !== undefined) updates.logoUrl = logoUrl?.trim() || null;
  if (website !== undefined) updates.website = website?.trim() || null;
  if (contactEmail !== undefined) updates.contactEmail = contactEmail?.trim() || null;
  if (country !== undefined) updates.country = country?.trim() || null;
  if (foundedYear !== undefined) updates.foundedYear = foundedYear ? Number(foundedYear) : null;

  const [updated] = await db
    .update(genhalLanguageOrgsTable)
    .set(updates)
    .where(eq(genhalLanguageOrgsTable.id, orgId))
    .returning();

  res.json({ org: serializeOrg(updated) });
});

// ─── Authenticated: list members ─────────────────────────────────────────────
router.get("/genhal/language-orgs/:id/members", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const orgId = Number(req.params.id);

  const m = await getMembership(orgId, userId);
  const isAdmin = ADMIN_IDS().includes(userId);
  if (!m && !isAdmin) {
    res.status(403).json({ error: "Members only" }); return;
  }

  const members = await db
    .select()
    .from(genhalLanguageOrgMembersTable)
    .where(eq(genhalLanguageOrgMembersTable.orgId, orgId))
    .orderBy(genhalLanguageOrgMembersTable.joinedAt);

  res.json({ members: members.map(serializeMember) });
});

// ─── Authenticated: invite member ────────────────────────────────────────────
router.post("/genhal/language-orgs/:id/members", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const orgId = Number(req.params.id);

  const m = await getMembership(orgId, userId);
  if (!m || !canManage(m.role)) {
    res.status(403).json({ error: "Only org admins can invite members" }); return;
  }

  const { clerkUserId, role = "contributor" } = req.body;
  if (!clerkUserId) { res.status(400).json({ error: "clerkUserId required" }); return; }
  if (!["admin", "reviewer", "contributor", "viewer"].includes(role)) {
    res.status(400).json({ error: "Invalid role" }); return;
  }

  const [member] = await db
    .insert(genhalLanguageOrgMembersTable)
    .values({ orgId, clerkUserId, role, status: "active", invitedByClerkUserId: userId })
    .onConflictDoUpdate({
      target: [genhalLanguageOrgMembersTable.orgId, genhalLanguageOrgMembersTable.clerkUserId],
      set: { role, status: "active", invitedByClerkUserId: userId },
    })
    .returning();

  res.status(201).json({ member: serializeMember(member) });
});

// ─── Authenticated: update member ────────────────────────────────────────────
router.patch("/genhal/language-orgs/:id/members/:mid", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const orgId = Number(req.params.id);
  const mid = Number(req.params.mid);

  const m = await getMembership(orgId, userId);
  if (!m || !canManage(m.role)) {
    res.status(403).json({ error: "Only org admins can update members" }); return;
  }

  const { role, status } = req.body;
  const updates: Partial<typeof genhalLanguageOrgMembersTable.$inferInsert> = {};
  if (role && ["admin", "reviewer", "contributor", "viewer"].includes(role)) updates.role = role;
  if (status && ["active", "removed"].includes(status)) updates.status = status;

  const [updated] = await db
    .update(genhalLanguageOrgMembersTable)
    .set(updates)
    .where(
      and(
        eq(genhalLanguageOrgMembersTable.id, mid),
        eq(genhalLanguageOrgMembersTable.orgId, orgId),
      ),
    )
    .returning();

  if (!updated) { res.status(404).json({ error: "Member not found" }); return; }
  res.json({ member: serializeMember(updated) });
});

// ─── Authenticated: remove member ────────────────────────────────────────────
router.delete("/genhal/language-orgs/:id/members/:mid", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const orgId = Number(req.params.id);
  const mid = Number(req.params.mid);

  const m = await getMembership(orgId, userId);
  if (!m || !canManage(m.role)) {
    res.status(403).json({ error: "Only org admins can remove members" }); return;
  }

  const [target] = await db
    .select()
    .from(genhalLanguageOrgMembersTable)
    .where(and(eq(genhalLanguageOrgMembersTable.id, mid), eq(genhalLanguageOrgMembersTable.orgId, orgId)))
    .limit(1);

  if (!target) { res.status(404).json({ error: "Member not found" }); return; }
  if (target.role === "owner") { res.status(400).json({ error: "Cannot remove the org owner" }); return; }

  await db
    .update(genhalLanguageOrgMembersTable)
    .set({ status: "removed" })
    .where(eq(genhalLanguageOrgMembersTable.id, mid));

  res.json({ ok: true });
});

// ─── Authenticated: add language to org ──────────────────────────────────────
router.post("/genhal/language-orgs/:id/languages", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const orgId = Number(req.params.id);

  const m = await getMembership(orgId, userId);
  if (!m || !canManage(m.role)) {
    res.status(403).json({ error: "Only org admins can add languages" }); return;
  }

  const { languageCode, requiresApproval = false, isPrimaryOrg = false } = req.body;
  if (!languageCode) { res.status(400).json({ error: "languageCode required" }); return; }

  const [lang] = await db
    .insert(genhalLanguageOrgLanguagesTable)
    .values({ orgId, languageCode, requiresApproval: !!requiresApproval, isPrimaryOrg: !!isPrimaryOrg })
    .onConflictDoUpdate({
      target: [genhalLanguageOrgLanguagesTable.orgId, genhalLanguageOrgLanguagesTable.languageCode],
      set: { requiresApproval: !!requiresApproval, isPrimaryOrg: !!isPrimaryOrg },
    })
    .returning();

  res.status(201).json({ language: lang });
});

// ─── Authenticated: update language approval setting ─────────────────────────
router.patch("/genhal/language-orgs/:id/languages/:code", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const orgId = Number(req.params.id);
  const languageCode = req.params.code;

  const m = await getMembership(orgId, userId);
  const isAdmin = ADMIN_IDS().includes(userId);
  if (!isAdmin && (!m || !canManage(m.role))) {
    res.status(403).json({ error: "Only org admins can update language settings" }); return;
  }

  const { requiresApproval, isPrimaryOrg } = req.body;
  const updates: Partial<typeof genhalLanguageOrgLanguagesTable.$inferInsert> = {};
  if (requiresApproval !== undefined) updates.requiresApproval = !!requiresApproval;
  if (isPrimaryOrg !== undefined) updates.isPrimaryOrg = !!isPrimaryOrg;

  const [updated] = await db
    .update(genhalLanguageOrgLanguagesTable)
    .set(updates)
    .where(
      and(
        eq(genhalLanguageOrgLanguagesTable.orgId, orgId),
        sql`${genhalLanguageOrgLanguagesTable.languageCode} = ${languageCode}`,
      ),
    )
    .returning();

  if (!updated) { res.status(404).json({ error: "Language not found in org" }); return; }
  res.json({ language: updated });
});

// ─── Authenticated: remove language from org ─────────────────────────────────
router.delete("/genhal/language-orgs/:id/languages/:code", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const orgId = Number(req.params.id);
  const languageCode = req.params.code;

  const m = await getMembership(orgId, userId);
  if (!m || !canManage(m.role)) {
    res.status(403).json({ error: "Only org admins can remove languages" }); return;
  }

  await db
    .delete(genhalLanguageOrgLanguagesTable)
    .where(
      and(
        eq(genhalLanguageOrgLanguagesTable.orgId, orgId),
        sql`${genhalLanguageOrgLanguagesTable.languageCode} = ${languageCode}`,
      ),
    );

  res.json({ ok: true });
});

// ─── Reviewer: list pending datasets for this org's languages ─────────────────
router.get("/genhal/language-orgs/:id/pending-datasets", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const orgId = Number(req.params.id);

  const m = await getMembership(orgId, userId);
  if (!m || !canReview(m.role)) {
    res.status(403).json({ error: "Reviewers only" }); return;
  }

  // Get the language codes this org manages with approval required
  const orgLangs = await db
    .select({ languageCode: genhalLanguageOrgLanguagesTable.languageCode })
    .from(genhalLanguageOrgLanguagesTable)
    .where(
      and(
        eq(genhalLanguageOrgLanguagesTable.orgId, orgId),
        eq(genhalLanguageOrgLanguagesTable.requiresApproval, true),
      ),
    );

  if (orgLangs.length === 0) {
    res.json({ datasets: [] }); return;
  }

  const codes = orgLangs.map((l) => l.languageCode);
  const datasets = await db
    .select()
    .from(genhalLanguageDatasetsTable)
    .where(
      and(
        inArray(genhalLanguageDatasetsTable.languageCode, codes),
        eq(genhalLanguageDatasetsTable.orgApprovalStatus, "pending"),
      ),
    )
    .orderBy(desc(genhalLanguageDatasetsTable.createdAt))
    .limit(100);

  res.json({ datasets: datasets.map(serializeDataset) });
});

// ─── Reviewer: approve or reject a dataset ────────────────────────────────────
router.post(
  "/genhal/language-orgs/:id/datasets/:datasetId/review",
  requireAuth(),
  async (req, res) => {
    const { userId } = getAuth(req);
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const orgId = Number(req.params.id);
    const datasetId = Number(req.params.datasetId);

    const m = await getMembership(orgId, userId);
    if (!m || !canReview(m.role)) {
      res.status(403).json({ error: "Reviewers only" }); return;
    }

    const { decision, rejectionReason } = req.body;
    if (!["approved", "rejected"].includes(decision)) {
      res.status(400).json({ error: "decision must be 'approved' or 'rejected'" }); return;
    }

    // Confirm dataset belongs to a language this org manages
    const [dataset] = await db
      .select()
      .from(genhalLanguageDatasetsTable)
      .where(eq(genhalLanguageDatasetsTable.id, datasetId))
      .limit(1);

    if (!dataset) { res.status(404).json({ error: "Dataset not found" }); return; }

    const [orgLang] = await db
      .select()
      .from(genhalLanguageOrgLanguagesTable)
      .where(
        and(
          eq(genhalLanguageOrgLanguagesTable.orgId, orgId),
          eq(genhalLanguageOrgLanguagesTable.languageCode, dataset.languageCode),
        ),
      )
      .limit(1);

    if (!orgLang) {
      res.status(403).json({ error: "This dataset's language is not managed by your org" }); return;
    }

    const now = new Date();
    const [updated] = await db
      .update(genhalLanguageDatasetsTable)
      .set({
        orgApprovalStatus: decision,
        orgReviewedByClerkUserId: userId,
        orgReviewedAt: now,
        orgRejectionReason: decision === "rejected" ? (rejectionReason?.trim() || null) : null,
        // Org approval → eligible for AI training
        approvedForTraining: decision === "approved",
        status: decision === "approved" ? "ready" : "rejected",
        updatedAt: now,
      })
      .where(eq(genhalLanguageDatasetsTable.id, datasetId))
      .returning();

    logger.info({ datasetId, decision, orgId, userId }, "[lang-orgs] dataset reviewed");
    res.json({ dataset: serializeDataset(updated) });
  },
);

// ─── Admin: list all orgs ────────────────────────────────────────────────────
router.get("/genhal/admin/language-orgs", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId || !ADMIN_IDS().includes(userId)) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  const orgs = await db
    .select()
    .from(genhalLanguageOrgsTable)
    .orderBy(desc(genhalLanguageOrgsTable.createdAt));

  res.json({ orgs: orgs.map(serializeOrg) });
});

// ─── Admin: approve / reject / suspend org ───────────────────────────────────
router.patch("/genhal/admin/language-orgs/:id", requireAuth(), async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId || !ADMIN_IDS().includes(userId)) {
    res.status(403).json({ error: "Admin only" }); return;
  }

  const orgId = Number(req.params.id);
  const { status, adminNotes } = req.body;
  if (!["approved", "rejected", "suspended", "pending"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }

  const [updated] = await db
    .update(genhalLanguageOrgsTable)
    .set({
      status,
      adminNotes: adminNotes?.trim() || null,
      reviewedByClerkUserId: userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(genhalLanguageOrgsTable.id, orgId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Org not found" }); return; }
  logger.info({ orgId, status, userId }, "[lang-orgs] admin updated org status");
  res.json({ org: serializeOrg(updated) });
});

// ─── Serializers ─────────────────────────────────────────────────────────────

function serializeOrg(o: typeof genhalLanguageOrgsTable.$inferSelect) {
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    description: o.description,
    logoUrl: o.logoUrl,
    website: o.website,
    contactEmail: o.contactEmail,
    country: o.country,
    foundedYear: o.foundedYear,
    status: o.status,
    adminNotes: o.adminNotes,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

function serializeMember(m: typeof genhalLanguageOrgMembersTable.$inferSelect) {
  return {
    id: m.id,
    orgId: m.orgId,
    clerkUserId: m.clerkUserId,
    role: m.role,
    status: m.status,
    invitedByClerkUserId: m.invitedByClerkUserId,
    joinedAt: m.joinedAt?.toISOString() ?? null,
  };
}

function serializeDataset(d: typeof genhalLanguageDatasetsTable.$inferSelect) {
  return {
    id: d.id,
    clerkUserId: d.clerkUserId,
    languageCode: d.languageCode,
    type: d.type,
    title: d.title,
    description: d.description,
    fileUrl: d.fileUrl,
    fileName: d.fileName,
    fileSizeBytes: d.fileSizeBytes,
    status: d.status,
    approvedForTraining: d.approvedForTraining,
    orgApprovalStatus: d.orgApprovalStatus,
    orgRejectionReason: d.orgRejectionReason,
    orgReviewedAt: d.orgReviewedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}
