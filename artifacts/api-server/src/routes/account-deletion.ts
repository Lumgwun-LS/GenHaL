/**
 * Self-service account deletion.
 *
 * GET  /vendors/:id/deletion-eligibility        — can this vendor delete their data right now?
 * POST /vendors/:id/deletion-requests           — start deletion: emails + texts two one-time codes
 * POST /vendors/:id/deletion-requests/verify    — confirm both codes, then permanently delete the vendor
 */
import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, vendorsTable, accountDeletionRequestsTable, bannedIdentifiersTable } from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { sendEmail } from "../lib/mailer";
import { wrapVendorEmail, escapeHtml } from "../lib/email-branding";
import { sendSms } from "../lib/sms";
import {
  checkDeletionEligibility,
  generateCode,
  hashCode,
  DELETION_CODE_TTL_MS,
  MAX_VERIFY_ATTEMPTS,
} from "../lib/account-deletion";

function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

const router = Router();

async function loadOwnedVendor(req: Request, res: Response): Promise<{ vendorId: number; userId: string } | null> {
  const vendorId = Number(req.params.id);
  if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid vendor id" }); return null; }

  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return null; }

  if (vendor.clerkUserId !== userId && !isAdmin(userId)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return { vendorId, userId };
}

// ─── GET /vendors/:id/deletion-eligibility ───────────────────────────────────

router.get("/vendors/:id/deletion-eligibility", async (req, res): Promise<void> => {
  const ctx = await loadOwnedVendor(req, res);
  if (!ctx) return;

  const eligibility = await checkDeletionEligibility(ctx.vendorId);
  res.json(eligibility);
});

// ─── POST /vendors/:id/deletion-requests ─────────────────────────────────────

router.post("/vendors/:id/deletion-requests", async (req, res): Promise<void> => {
  const ctx = await loadOwnedVendor(req, res);
  if (!ctx) return;

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, ctx.vendorId));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const eligibility = await checkDeletionEligibility(ctx.vendorId);
  if (!eligibility.eligible) {
    res.status(409).json({ error: "Not eligible to delete data yet.", reasons: eligibility.reasons });
    return;
  }

  if (!vendor.phone) {
    res.status(400).json({ error: "A phone number must be on file to confirm deletion by SMS." });
    return;
  }

  const emailCode = generateCode();
  const phoneCode = generateCode();
  const expiresAt = new Date(Date.now() + DELETION_CODE_TTL_MS);

  const [request] = await db
    .insert(accountDeletionRequestsTable)
    .values({
      vendorId: ctx.vendorId,
      emailCodeHash: hashCode(emailCode),
      phoneCodeHash: hashCode(phoneCode),
      expiresAt,
    })
    .returning();

  const [emailResult, smsResult] = await Promise.all([
    sendEmail({
      to: vendor.email,
      subject: "Confirm deletion of your VendorHub account data",
      html: wrapVendorEmail({
        bodyHtml: `<p>Hi ${escapeHtml(vendor.name)},</p><p>Use this code to confirm permanent deletion of your account data: <strong>${emailCode}</strong></p><p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
      }),
    }),
    sendSms({
      to: vendor.phone,
      body: `Your VendorHub account deletion code is ${phoneCode}. It expires in 10 minutes.`,
    }),
  ]);

  // Both codes are required to confirm deletion, so if either channel didn't actually
  // deliver, the vendor would be stuck unable to ever complete verification. Fail fast
  // and don't leave a pending request around for that case.
  if (emailResult.status !== "sent" || smsResult.status !== "sent") {
    await db.delete(accountDeletionRequestsTable).where(eq(accountDeletionRequestsTable.id, request!.id));
    res.status(502).json({
      error: "Could not deliver both confirmation codes. Please verify your email and phone number are correct and try again.",
      emailDelivery: emailResult.status,
      smsDelivery: smsResult.status,
    });
    return;
  }

  res.status(201).json({
    requestId: request!.id,
    expiresAt: expiresAt.toISOString(),
    emailDelivery: emailResult.status,
    smsDelivery: smsResult.status,
  });
});

// ─── POST /vendors/:id/deletion-requests/verify ──────────────────────────────

router.post("/vendors/:id/deletion-requests/verify", async (req, res): Promise<void> => {
  const ctx = await loadOwnedVendor(req, res);
  if (!ctx) return;

  const body = req.body as { emailCode?: unknown; phoneCode?: unknown };
  if (typeof body.emailCode !== "string" || typeof body.phoneCode !== "string") {
    res.status(400).json({ error: "emailCode and phoneCode are required." });
    return;
  }

  const [request] = await db
    .select()
    .from(accountDeletionRequestsTable)
    .where(and(eq(accountDeletionRequestsTable.vendorId, ctx.vendorId), isNull(accountDeletionRequestsTable.consumedAt)))
    .orderBy(desc(accountDeletionRequestsTable.createdAt))
    .limit(1);

  if (!request) {
    res.status(404).json({ error: "No pending deletion request. Start a new one first." });
    return;
  }

  if (request.expiresAt.getTime() < Date.now()) {
    res.status(410).json({ error: "This deletion code has expired. Please request a new one." });
    return;
  }

  if (request.attempts >= MAX_VERIFY_ATTEMPTS) {
    res.status(429).json({ error: "Too many incorrect attempts. Please request a new code." });
    return;
  }

  const emailMatches = hashCode(body.emailCode) === request.emailCodeHash;
  const phoneMatches = hashCode(body.phoneCode) === request.phoneCodeHash;

  if (!emailMatches || !phoneMatches) {
    await db
      .update(accountDeletionRequestsTable)
      .set({ attempts: request.attempts + 1 })
      .where(eq(accountDeletionRequestsTable.id, request.id));
    res.status(400).json({ error: "One or both codes are incorrect." });
    return;
  }

  // Re-check eligibility right before deleting — state may have changed since the request was made.
  const eligibility = await checkDeletionEligibility(ctx.vendorId);
  if (!eligibility.eligible) {
    res.status(409).json({ error: "Not eligible to delete data anymore.", reasons: eligibility.reasons });
    return;
  }

  await db
    .update(accountDeletionRequestsTable)
    .set({ emailVerifiedAt: new Date(), phoneVerifiedAt: new Date(), consumedAt: new Date() })
    .where(eq(accountDeletionRequestsTable.id, request.id));

  // Read the vendor's identifiers before cascade-deleting them, then blacklist them
  // so the same email / phone can never be used to create a new account.
  const [vendor] = await db
    .select({ email: vendorsTable.email, phone: vendorsTable.phone })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, ctx.vendorId));

  if (vendor?.email || vendor?.phone) {
    await db.insert(bannedIdentifiersTable).values({
      email: vendor.email ? vendor.email.toLowerCase() : null,
      phone: vendor.phone ?? null,
      reason: "account_deleted",
    }).onConflictDoNothing();
  }

  // Cascading foreign keys remove all data linked to this vendor (orders, products,
  // leads, posts, payments, etc.) — see onDelete: "cascade" on each schema.
  await db.delete(vendorsTable).where(eq(vendorsTable.id, ctx.vendorId));

  res.json({ success: true });
});

export default router;
