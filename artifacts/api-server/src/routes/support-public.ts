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
  db, vendorsTable, productsTable, ordersTable, orderItemsTable,
  invoicesTable, invoiceItemsTable, paymentsTable,
  vendorCustomerMessagesTable, vendorWebsitesTable,
  supportTicketsTable, supportTicketMessagesTable, vendorNotificationsTable,
} from "@workspace/db";
import { eq, and, desc, count, gte, sql, inArray, ne, sum, max, countDistinct } from "drizzle-orm";
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

// ── GET /public/support/:vendorId/my-transactions ─────────────────────────────
// Returns all orders for a given customer email at this vendor, with line items.
// Used by the vendor website's embedded customer dashboard.
router.get("/public/support/:vendorId/my-transactions", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.params.vendorId ?? "");
  const { email } = req.query as { email?: string };

  if (isNaN(vendorId) || !email?.trim()) {
    res.status(400).json({ error: "vendorId and email are required" }); return;
  }

  const orders = await db
    .select({
      id:            ordersTable.id,
      status:        ordersTable.status,
      paymentStatus: ordersTable.paymentStatus,
      totalAmount:   ordersTable.totalAmount,
      currency:      ordersTable.currency,
      notes:         ordersTable.notes,
      createdAt:     ordersTable.createdAt,
      updatedAt:     ordersTable.updatedAt,
    })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.vendorId, vendorId),
      eq(sql`lower(${ordersTable.customerEmail})`, email.trim().toLowerCase()),
    ))
    .orderBy(desc(ordersTable.createdAt))
    .limit(50);

  const orderIds = orders.map(o => o.id);
  const items = orderIds.length > 0
    ? await db
        .select({
          id:          orderItemsTable.id,
          orderId:     orderItemsTable.orderId,
          productName: orderItemsTable.productName,
          quantity:    orderItemsTable.quantity,
          unitPrice:   orderItemsTable.unitPrice,
          totalPrice:  orderItemsTable.totalPrice,
        })
        .from(orderItemsTable)
        .where(inArray(orderItemsTable.orderId, orderIds))
    : [];

  const itemsByOrder = items.reduce<Record<number, typeof items>>((acc, item) => {
    (acc[item.orderId] ??= []).push(item);
    return acc;
  }, {});

  res.json({
    orders: orders.map(o => ({ ...o, items: itemsByOrder[o.id] ?? [] })),
  });
});

// ── GET /public/support/:vendorId/my-invoices ─────────────────────────────────
// Returns all non-draft invoices for a given customer email at this vendor, with line items.
router.get("/public/support/:vendorId/my-invoices", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.params.vendorId ?? "");
  const { email } = req.query as { email?: string };

  if (isNaN(vendorId) || !email?.trim()) {
    res.status(400).json({ error: "vendorId and email are required" }); return;
  }

  const invoices = await db
    .select({
      id:             invoicesTable.id,
      customerName:   invoicesTable.customerName,
      currency:       invoicesTable.currency,
      subtotal:       invoicesTable.subtotal,
      discountAmount: invoicesTable.discountAmount,
      taxAmount:      invoicesTable.taxAmount,
      totalAmount:    invoicesTable.totalAmount,
      status:         invoicesTable.status,
      dueDate:        invoicesTable.dueDate,
      shareToken:     invoicesTable.shareToken,
      notes:          invoicesTable.notes,
      sentAt:         invoicesTable.sentAt,
      createdAt:      invoicesTable.createdAt,
      updatedAt:      invoicesTable.updatedAt,
    })
    .from(invoicesTable)
    .where(and(
      eq(invoicesTable.vendorId, vendorId),
      eq(sql`lower(${invoicesTable.customerEmail})`, email.trim().toLowerCase()),
      ne(invoicesTable.status, "draft"),
    ))
    .orderBy(desc(invoicesTable.createdAt))
    .limit(50);

  const invoiceIds = invoices.map(i => i.id);
  const items = invoiceIds.length > 0
    ? await db
        .select({
          id:          invoiceItemsTable.id,
          invoiceId:   invoiceItemsTable.invoiceId,
          description: invoiceItemsTable.description,
          quantity:    invoiceItemsTable.quantity,
          unitPrice:   invoiceItemsTable.unitPrice,
          totalPrice:  invoiceItemsTable.totalPrice,
          type:        invoiceItemsTable.type,
        })
        .from(invoiceItemsTable)
        .where(inArray(invoiceItemsTable.invoiceId, invoiceIds))
    : [];

  const itemsByInvoice = items.reduce<Record<number, typeof items>>((acc, item) => {
    (acc[item.invoiceId] ??= []).push(item);
    return acc;
  }, {});

  res.json({
    invoices: invoices.map(i => ({
      ...i,
      sentAt:    i.sentAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
      items:     itemsByInvoice[i.id] ?? [],
    })),
  });
});

// ── GET /public/support/:vendorId/my-products ─────────────────────────────────
// Returns distinct products a customer has ordered from this vendor, aggregated.
router.get("/public/support/:vendorId/my-products", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.params.vendorId ?? "");
  const { email } = req.query as { email?: string };

  if (isNaN(vendorId) || !email?.trim()) {
    res.status(400).json({ error: "vendorId and email are required" }); return;
  }

  const rows = await db
    .select({
      productId:     orderItemsTable.productId,
      productName:   orderItemsTable.productName,
      category:      productsTable.category,
      imageUrl:      productsTable.imageUrl,
      currency:      ordersTable.currency,
      totalQty:      sum(orderItemsTable.quantity).mapWith(Number),
      totalSpent:    sum(orderItemsTable.totalPrice),
      orderCount:    countDistinct(ordersTable.id).mapWith(Number),
      lastOrderedAt: max(ordersTable.createdAt),
    })
    .from(orderItemsTable)
    .innerJoin(ordersTable, and(
      eq(orderItemsTable.orderId, ordersTable.id),
      eq(ordersTable.vendorId, vendorId),
      eq(sql`lower(${ordersTable.customerEmail})`, email.trim().toLowerCase()),
    ))
    .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .groupBy(
      orderItemsTable.productId,
      orderItemsTable.productName,
      productsTable.category,
      productsTable.imageUrl,
      ordersTable.currency,
    )
    .orderBy(desc(max(ordersTable.createdAt)));

  res.json({
    products: rows.map(r => ({
      productId:     r.productId,
      productName:   r.productName,
      category:      r.category ?? null,
      imageUrl:      r.imageUrl ?? null,
      currency:      r.currency,
      totalQty:      r.totalQty ?? 0,
      totalSpent:    r.totalSpent ?? "0",
      orderCount:    r.orderCount ?? 0,
      lastOrderedAt: r.lastOrderedAt?.toISOString() ?? new Date().toISOString(),
    })),
  });
});

// ── GET /public/support/:vendorId/my-refunds ──────────────────────────────────
// Returns all refunded payments linked to this customer's orders at this vendor.
router.get("/public/support/:vendorId/my-refunds", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.params.vendorId ?? "");
  const { email } = req.query as { email?: string };

  if (isNaN(vendorId) || !email?.trim()) {
    res.status(400).json({ error: "vendorId and email are required" }); return;
  }

  // Refunded payments linked to this customer's orders
  const refunds = await db
    .select({
      paymentId:         paymentsTable.id,
      provider:          paymentsTable.provider,
      providerReference: paymentsTable.providerReference,
      amount:            paymentsTable.amount,
      currency:          paymentsTable.currency,
      refundedAt:        paymentsTable.updatedAt,
      orderId:           paymentsTable.orderId,
    })
    .from(paymentsTable)
    .innerJoin(ordersTable, and(
      eq(paymentsTable.orderId, ordersTable.id),
      eq(ordersTable.vendorId, vendorId),
      eq(sql`lower(${ordersTable.customerEmail})`, email.trim().toLowerCase()),
    ))
    .where(eq(paymentsTable.status, "refunded"))
    .orderBy(desc(paymentsTable.updatedAt))
    .limit(50);

  // Fetch order items for each refunded order
  const orderIds = refunds.map(r => r.orderId).filter((id): id is number => id !== null);
  const items = orderIds.length > 0
    ? await db
        .select({
          id:          orderItemsTable.id,
          orderId:     orderItemsTable.orderId,
          productName: orderItemsTable.productName,
          quantity:    orderItemsTable.quantity,
          unitPrice:   orderItemsTable.unitPrice,
          totalPrice:  orderItemsTable.totalPrice,
        })
        .from(orderItemsTable)
        .where(inArray(orderItemsTable.orderId, orderIds))
    : [];

  const itemsByOrder = items.reduce<Record<number, typeof items>>((acc, item) => {
    (acc[item.orderId] ??= []).push(item);
    return acc;
  }, {});

  res.json({
    refunds: refunds.map(r => ({
      paymentId:         r.paymentId,
      provider:          r.provider,
      providerReference: r.providerReference,
      amount:            r.amount,
      currency:          r.currency,
      refundedAt:        r.refundedAt.toISOString(),
      orderId:           r.orderId,
      orderItems:        r.orderId ? (itemsByOrder[r.orderId] ?? []) : [],
    })),
  });
});

// ── GET /public/support/:vendorId/my-messages ─────────────────────────────────
// Returns all messages in the thread between this customer and the vendor.
// Also marks all vendor_to_customer messages as read.
router.get("/public/support/:vendorId/my-messages", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.params.vendorId ?? "");
  const { email } = req.query as { email?: string };
  if (isNaN(vendorId) || !email?.trim()) {
    res.status(400).json({ error: "vendorId and email are required" }); return;
  }
  const normalised = email.trim().toLowerCase();

  const msgs = await db
    .select({
      id:        vendorCustomerMessagesTable.id,
      direction: vendorCustomerMessagesTable.direction,
      subject:   vendorCustomerMessagesTable.subject,
      body:      vendorCustomerMessagesTable.body,
      read:      vendorCustomerMessagesTable.read,
      createdAt: vendorCustomerMessagesTable.createdAt,
    })
    .from(vendorCustomerMessagesTable)
    .where(and(
      eq(vendorCustomerMessagesTable.vendorId, vendorId),
      eq(sql`lower(${vendorCustomerMessagesTable.customerEmail})`, normalised),
    ))
    .orderBy(vendorCustomerMessagesTable.createdAt);

  // Mark all vendor→customer messages as read when customer opens inbox
  await db.update(vendorCustomerMessagesTable)
    .set({ read: true, readAt: new Date() })
    .where(and(
      eq(vendorCustomerMessagesTable.vendorId, vendorId),
      eq(sql`lower(${vendorCustomerMessagesTable.customerEmail})`, normalised),
      eq(vendorCustomerMessagesTable.direction, "vendor_to_customer"),
      eq(vendorCustomerMessagesTable.read, false),
    ));

  res.json({
    messages: msgs.map(m => ({ ...m, createdAt: m.createdAt.toISOString() })),
  });
});

// ── POST /public/support/:vendorId/my-messages ────────────────────────────────
// Customer sends a message to the vendor.
router.post("/public/support/:vendorId/my-messages", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.params.vendorId ?? "");
  if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid vendorId" }); return; }

  const { customerEmail, customerName, subject, body } = req.body as {
    customerEmail: string; customerName?: string; subject?: string; body: string;
  };
  if (!customerEmail?.trim()) { res.status(400).json({ error: "customerEmail is required" }); return; }
  if (!body?.trim())           { res.status(400).json({ error: "body is required" }); return; }

  // Confirm vendor exists
  const [vendor] = await db.select({ id: vendorsTable.id })
    .from(vendorsTable).where(eq(vendorsTable.id, vendorId)).limit(1);
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const [msg] = await db.insert(vendorCustomerMessagesTable).values({
    vendorId,
    customerId:    null,
    customerEmail: customerEmail.trim().toLowerCase(),
    customerName:  customerName?.trim() || customerEmail.split("@")[0],
    subject:       subject?.trim() || null,
    body:          body.trim(),
    direction:     "customer_to_vendor",
    read:          false,
  }).returning();

  res.status(201).json({ message: { ...msg!, createdAt: msg!.createdAt.toISOString() } });
});

// ── GET /public/support/:vendorId/my-vendors ──────────────────────────────────
// Returns all vendors this customer has interacted with (orders, tickets, messages).
router.get("/public/support/:vendorId/my-vendors", async (req, res): Promise<void> => {
  const { email } = req.query as { email?: string };
  if (!email?.trim()) { res.status(400).json({ error: "email is required" }); return; }
  const normalised = email.trim().toLowerCase();

  // 1) Vendors from orders — with aggregated spend + order count
  const orderRows = await db
    .select({
      vendorId:   ordersTable.vendorId,
      currency:   ordersTable.currency,
      orderCount: countDistinct(ordersTable.id).mapWith(Number),
      totalSpent: sum(ordersTable.totalAmount),
      lastAt:     max(ordersTable.createdAt),
    })
    .from(ordersTable)
    .where(eq(sql`lower(${ordersTable.customerEmail})`, normalised))
    .groupBy(ordersTable.vendorId, ordersTable.currency);

  // 2) Vendors from support tickets
  const ticketRows = await db
    .select({
      vendorId: supportTicketsTable.vendorId,
      lastAt:   max(supportTicketsTable.createdAt),
    })
    .from(supportTicketsTable)
    .where(eq(sql`lower(${supportTicketsTable.customerEmail})`, normalised))
    .groupBy(supportTicketsTable.vendorId);

  // 3) Vendors from messages
  const msgRows = await db
    .select({
      vendorId: vendorCustomerMessagesTable.vendorId,
      lastAt:   max(vendorCustomerMessagesTable.createdAt),
    })
    .from(vendorCustomerMessagesTable)
    .where(eq(sql`lower(${vendorCustomerMessagesTable.customerEmail})`, normalised))
    .groupBy(vendorCustomerMessagesTable.vendorId);

  // Merge into a map keyed by vendorId
  type VMap = {
    orderCount: number; totalSpent: string; currency: string;
    lastAt: Date | null; sources: Set<string>;
  };
  const vmap = new Map<number, VMap>();

  for (const r of orderRows) {
    vmap.set(r.vendorId, {
      orderCount: r.orderCount, totalSpent: r.totalSpent ?? "0",
      currency: r.currency, lastAt: r.lastAt ?? null,
      sources: new Set(["orders"]),
    });
  }
  for (const r of ticketRows) {
    const existing = vmap.get(r.vendorId);
    if (existing) {
      existing.sources.add("tickets");
      if (r.lastAt && (!existing.lastAt || r.lastAt > existing.lastAt)) existing.lastAt = r.lastAt;
    } else {
      vmap.set(r.vendorId, { orderCount: 0, totalSpent: "0", currency: "USD", lastAt: r.lastAt ?? null, sources: new Set(["tickets"]) });
    }
  }
  for (const r of msgRows) {
    const existing = vmap.get(r.vendorId);
    if (existing) {
      existing.sources.add("messages");
      if (r.lastAt && (!existing.lastAt || r.lastAt > existing.lastAt)) existing.lastAt = r.lastAt;
    } else {
      vmap.set(r.vendorId, { orderCount: 0, totalSpent: "0", currency: "USD", lastAt: r.lastAt ?? null, sources: new Set(["messages"]) });
    }
  }

  if (vmap.size === 0) { res.json({ vendors: [] }); return; }

  const vendorIds = Array.from(vmap.keys());

  // Fetch vendor details + site slugs
  const vendors = await db
    .select({
      id:          vendorsTable.id,
      name:        vendorsTable.name,
      logoUrl:     vendorsTable.logoUrl,
      description: vendorsTable.description,
      city:        vendorsTable.city,
      country:     vendorsTable.country,
      siteSlug:    vendorWebsitesTable.slug,
      sitePublished: vendorWebsitesTable.published,
      siteLogo:    vendorWebsitesTable.logoUrl,
    })
    .from(vendorsTable)
    .leftJoin(vendorWebsitesTable, and(
      eq(vendorWebsitesTable.vendorId, vendorsTable.id),
      eq(vendorWebsitesTable.published, true),
    ))
    .where(inArray(vendorsTable.id, vendorIds));

  const result = vendors
    .map(v => {
      const stats = vmap.get(v.id)!;
      return {
        vendorId:          v.id,
        name:              v.name,
        logoUrl:           v.siteLogo ?? v.logoUrl ?? null,
        description:       v.description ?? null,
        city:              v.city ?? null,
        country:           v.country ?? null,
        siteSlug:          v.siteSlug ?? null,
        orderCount:        stats.orderCount,
        totalSpent:        stats.totalSpent,
        currency:          stats.currency,
        lastInteractionAt: stats.lastAt?.toISOString() ?? new Date().toISOString(),
        sources:           Array.from(stats.sources),
      };
    })
    .sort((a, b) => new Date(b.lastInteractionAt).getTime() - new Date(a.lastInteractionAt).getTime());

  res.json({ vendors: result });
});

// ── GET /public/support/:vendorId/my-tickets ──────────────────────────────────
// Returns all tickets for a given customer email at this vendor.
// Used by the vendor website's embedded support portal to show ticket history.
router.get("/public/support/:vendorId/my-tickets", async (req, res): Promise<void> => {
  const vendorId = parseInt(req.params.vendorId ?? "");
  const { email } = req.query as { email?: string };

  if (isNaN(vendorId) || !email?.trim()) {
    res.status(400).json({ error: "vendorId and email are required" }); return;
  }

  const tickets = await db
    .select({
      id:          supportTicketsTable.id,
      ticketToken: supportTicketsTable.ticketToken,
      subject:     supportTicketsTable.subject,
      category:    supportTicketsTable.category,
      status:      supportTicketsTable.status,
      priority:    supportTicketsTable.priority,
      productName: supportTicketsTable.productName,
      createdAt:   supportTicketsTable.createdAt,
      updatedAt:   supportTicketsTable.updatedAt,
    })
    .from(supportTicketsTable)
    .where(and(
      eq(supportTicketsTable.vendorId, vendorId),
      eq(sql`lower(${supportTicketsTable.customerEmail})`, email.trim().toLowerCase()),
    ))
    .orderBy(desc(supportTicketsTable.updatedAt))
    .limit(50);

  res.json({ tickets });
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
