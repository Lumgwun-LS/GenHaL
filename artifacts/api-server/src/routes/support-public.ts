/**
 * Public support-ticket routes — no authentication required.
 * Mounted BEFORE requireAuth in routes/index.ts.
 *
 * Public support link format: /help/:vendorId (served by vendor-hub frontend)
 *
 * Customer verification flow:
 *  1. GET /public/support/:vendorId/check-customer?email=xxx
 *     → Looks up the email in the vendor's CRM (leads table) or past orders.
 *     → Returns { found, name } so the form can decide whether to show the
 *       "new visitor" name+phone signup step or just pre-fill and continue.
 *  2. POST /public/support/:vendorId/tickets
 *     → customerEmail is now required.
 *     → Upserts a platform_contact + CRM lead (or finds the existing lead).
 *     → Stores leadId + platformContactId on the ticket row.
 */
import { Router } from "express";
import crypto from "crypto";
import {
  db, vendorsTable, productsTable, ordersTable,
  supportTicketsTable, supportTicketMessagesTable, vendorNotificationsTable,
} from "@workspace/db";
import { eq, and, desc, count, gte, sql } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import { getBillingPeriodStart, getEffectiveTier } from "../lib/usage";
import { upsertPlatformContact, upsertVendorLead, findVendorLead } from "../lib/platform-contacts";
import { logger } from "../lib/logger";

const router = Router();
const objectStorageService = new ObjectStorageService();

/** Monthly ticket reception limits per plan tier */
const TICKET_LIMITS: Record<string, number> = {
  free:       20,
  starter:   100,
  pro:       500,
  enterprise: -1, // unlimited
};

// ── GET /public/support/:vendorId ─────────────────────────────────────────────
// Returns vendor branding + active products for the customer ticket form.
router.get("/public/support/:vendorId", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.params.vendorId ?? "");
  if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid vendor ID" }); return; }

  const [vendor] = await db
    .select({
      id: vendorsTable.id,
      name: vendorsTable.name,
      logoUrl: vendorsTable.logoUrl,
      description: vendorsTable.description,
      brandTheme: vendorsTable.brandTheme,
      industry: vendorsTable.industry,
    })
    .from(vendorsTable)
    .where(and(eq(vendorsTable.id, vendorId), eq(vendorsTable.status, "active")));

  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const products = await db
    .select({ id: productsTable.id, name: productsTable.name, price: productsTable.price, category: productsTable.category })
    .from(productsTable)
    .where(and(eq(productsTable.vendorId, vendorId), eq(productsTable.status, "active")))
    .orderBy(productsTable.name)
    .limit(200);

  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.json({ vendor, products });
});

// ── GET /public/support/:vendorId/check-customer ──────────────────────────────
// Check whether an email belongs to an existing CRM contact of this vendor.
// Returns { found: true, name } or { found: false } — used by the form to
// show the sign-up step only for new visitors.
router.get("/public/support/:vendorId/check-customer", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.params.vendorId ?? "");
  const { email } = req.query as { email?: string };

  if (isNaN(vendorId) || !email?.trim()) {
    res.status(400).json({ error: "vendorId and email are required" }); return;
  }

  // 1. Check CRM leads first
  const lead = await findVendorLead(vendorId, email.trim());
  if (lead) {
    res.json({ found: true, name: lead.name, source: "crm" }); return;
  }

  // 2. Fall back to orders (customer may have bought without being in CRM)
  const [order] = await db
    .select({ customerName: ordersTable.customerName })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.vendorId, vendorId),
      eq(sql`lower(${ordersTable.customerEmail})`, email.trim().toLowerCase()),
    ))
    .limit(1);

  if (order) {
    res.json({ found: true, name: order.customerName, source: "order" }); return;
  }

  res.json({ found: false });
});

// ── POST /public/support/:vendorId/tickets ────────────────────────────────────
// Customer submits a new support ticket.
// customerEmail is required — used to gate and identify the customer.
router.post("/public/support/:vendorId/tickets", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.params.vendorId ?? "");
  if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid vendor ID" }); return; }

  const {
    customerName, customerEmail, customerPhone,
    subject, category = "general",
    productId, productName, invoiceRef, orderRef, postId,
    message,
    attachmentUrls = [], attachmentTypes = [],
  } = req.body as {
    customerName?: string; customerEmail?: string; customerPhone?: string;
    subject?: string; category?: string;
    productId?: number; productName?: string;
    invoiceRef?: string; orderRef?: string; postId?: number;
    message?: string;
    attachmentUrls?: string[]; attachmentTypes?: string[];
  };

  if (!customerName?.trim()) { res.status(400).json({ error: "customerName is required" }); return; }
  if (!customerEmail?.trim()) { res.status(400).json({ error: "customerEmail is required — customers must verify their identity before submitting a ticket" }); return; }
  if (!subject?.trim()) { res.status(400).json({ error: "subject is required" }); return; }
  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  // Fetch vendor + tier for quota check
  const [vendor] = await db
    .select({
      id: vendorsTable.id,
      name: vendorsTable.name,
      subscriptionTier: vendorsTable.subscriptionTier,
      trialEndsAt: vendorsTable.trialEndsAt,
      featureTrialTier: vendorsTable.featureTrialTier,
      featureTrialExpiresAt: vendorsTable.featureTrialExpiresAt,
      currentPeriodStart: vendorsTable.currentPeriodStart,
      createdAt: vendorsTable.createdAt,
      status: vendorsTable.status,
    })
    .from(vendorsTable)
    .where(and(eq(vendorsTable.id, vendorId), eq(vendorsTable.status, "active")));

  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  // Quota check
  const tier = getEffectiveTier(vendor);
  const limit = TICKET_LIMITS[tier] ?? 20;
  if (limit !== -1) {
    const periodStart = getBillingPeriodStart(vendor);
    const [{ ticketCount }] = await db
      .select({ ticketCount: count() })
      .from(supportTicketsTable)
      .where(and(eq(supportTicketsTable.vendorId, vendorId), gte(supportTicketsTable.createdAt, periodStart)));
    if (ticketCount >= limit) {
      res.status(429).json({ error: "This vendor has reached their monthly support ticket limit. Please contact them via another channel." });
      return;
    }
  }

  // Upsert platform contact + vendor CRM lead
  const [platformContactId, leadId] = await Promise.all([
    upsertPlatformContact(customerEmail.trim(), { name: customerName.trim(), phone: customerPhone?.trim() }),
    upsertVendorLead(vendorId, customerEmail.trim(), {
      name: customerName.trim(),
      phone: customerPhone?.trim(),
      channel: "support",
      source: "support_ticket",
    }),
  ]);

  const ticketToken = crypto.randomBytes(24).toString("hex");

  const [ticket] = await db.transaction(async (tx) => {
    const [t] = await tx.insert(supportTicketsTable).values({
      vendorId,
      ticketToken,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase(),
      customerPhone: customerPhone?.trim() || null,
      subject: subject.trim(),
      category,
      productId: productId ?? null,
      productName: productName?.trim() || null,
      invoiceRef: invoiceRef?.trim() || null,
      orderRef: orderRef?.trim() || null,
      postId: postId ?? null,
      leadId,
      platformContactId,
    }).returning();

    await tx.insert(supportTicketMessagesTable).values({
      ticketId: t!.id,
      senderType: "customer",
      senderName: customerName.trim(),
      content: message.trim(),
      attachmentUrls: attachmentUrls.length ? attachmentUrls : null,
      attachmentTypes: attachmentTypes.length ? attachmentTypes : null,
    });

    await tx.insert(vendorNotificationsTable).values({
      vendorId,
      type: "support_ticket",
      message: `New support ticket from ${customerName.trim()}: "${subject.trim()}"`,
      resourceId: t!.id,
    });

    return [t];
  });

  logger.info({ ticketId: ticket!.id, vendorId, leadId, platformContactId }, "[support] New ticket created");

  res.status(201).json({ ticketId: ticket!.id, ticketToken, message: "Ticket submitted successfully." });
});

// ── GET /public/support/ticket/:token ─────────────────────────────────────────
// Customer views their ticket thread (status + messages) using the token.
router.get("/public/support/ticket/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  if (!token) { res.status(400).json({ error: "Missing token" }); return; }

  const [ticket] = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.ticketToken, token));

  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const [messages, vendor] = await Promise.all([
    db.select().from(supportTicketMessagesTable)
      .where(eq(supportTicketMessagesTable.ticketId, ticket.id))
      .orderBy(supportTicketMessagesTable.createdAt),
    db.select({ name: vendorsTable.name, logoUrl: vendorsTable.logoUrl })
      .from(vendorsTable).where(eq(vendorsTable.id, ticket.vendorId)),
  ]);

  res.json({
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      priority: ticket.priority,
      customerName: ticket.customerName,
      productName: ticket.productName,
      invoiceRef: ticket.invoiceRef,
      orderRef: ticket.orderRef,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    },
    messages,
    vendor: vendor[0] ?? null,
  });
});

// ── POST /public/support/ticket/:token/messages ────────────────────────────────
// Customer adds a follow-up message to their ticket.
router.post("/public/support/ticket/:token/messages", async (req, res): Promise<void> => {
  const { token } = req.params;
  const { message, attachmentUrls = [], attachmentTypes = [] } = req.body as {
    message?: string; attachmentUrls?: string[]; attachmentTypes?: string[];
  };

  if (!token) { res.status(400).json({ error: "Missing token" }); return; }
  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  const [ticket] = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.ticketToken, token));

  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (ticket.status === "closed") { res.status(409).json({ error: "This ticket is closed" }); return; }

  const [msg] = await db.transaction(async (tx) => {
    const [m] = await tx.insert(supportTicketMessagesTable).values({
      ticketId: ticket.id,
      senderType: "customer",
      senderName: ticket.customerName,
      content: message.trim(),
      attachmentUrls: attachmentUrls.length ? attachmentUrls : null,
      attachmentTypes: attachmentTypes.length ? attachmentTypes : null,
    }).returning();

    if (ticket.status === "resolved") {
      await tx.update(supportTicketsTable)
        .set({ status: "open", updatedAt: new Date() })
        .where(eq(supportTicketsTable.id, ticket.id));
    } else {
      await tx.update(supportTicketsTable)
        .set({ updatedAt: new Date() })
        .where(eq(supportTicketsTable.id, ticket.id));
    }

    await tx.insert(vendorNotificationsTable).values({
      vendorId: ticket.vendorId,
      type: "support_ticket",
      message: `Customer reply on ticket #${ticket.id}: "${ticket.subject}"`,
      resourceId: ticket.id,
    });

    return [m];
  });

  res.status(201).json(msg);
});

// ── POST /public/support/upload-url ───────────────────────────────────────────
router.post("/public/support/upload-url", async (req, res): Promise<void> => {
  const base = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN;
  if (!base) { res.status(500).json({ error: "No public domain configured" }); return; }
  try {
    const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadUrl);
    const objectId = objectPath.replace(/^\/objects\/uploads\//, "");
    const publicUrl = `https://${base}/api/media/${objectId}`;
    await objectStorageService
      .trySetObjectEntityAclPolicy(objectPath, { owner: "system:vendor-upload", visibility: "public" })
      .catch(() => { /* best-effort */ });
    res.json({ uploadUrl, publicUrl });
  } catch (err) {
    logger.error({ err }, "[support] Failed to get upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

export default router;
