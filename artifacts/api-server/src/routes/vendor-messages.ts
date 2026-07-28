/**
 * Vendor → Customer direct messaging.
 *
 * Routes (all require Clerk auth + vendor ownership):
 *   GET  /vendor-messages/contacts        — unique customers the vendor can message (from orders)
 *   GET  /vendor-messages/thread          — full thread with one customer (?email=)
 *   POST /vendor-messages/send            — send a message to a customer
 *   PUT  /vendor-messages/:id/read        — mark an inbound message as read
 *   GET  /vendor-messages/unread-count    — count of unread inbound messages
 */

import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, desc, sql, or } from "drizzle-orm";
import {
  db,
  vendorsTable,
  vendorCustomerMessagesTable,
  customerNotificationsTable,
  customersTable,
  ordersTable,
} from "@workspace/db";
import { sendEmail } from "../lib/mailer";
import { wrapVendorEmail } from "../lib/email-branding";

const router: IRouter = Router();
export default router;

// ── Auth helper ────────────────────────────────────────────────────────────────

async function resolveAuthedVendor(req: import("express").Request) {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const [v] = await db
    .select({ id: vendorsTable.id, name: vendorsTable.name, email: vendorsTable.email, logoUrl: vendorsTable.logoUrl })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, userId))
    .limit(1);
  return v ?? null;
}

// ── GET /vendor-messages/contacts ─────────────────────────────────────────────
// Returns the list of unique customers the vendor has interacted with
// (from orders + existing messages), with last-message snippet + unread count.

router.get("/vendor-messages/contacts", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Customers from orders (distinct by email)
  const orderContacts = await db
    .selectDistinctOn([ordersTable.customerEmail], {
      email:     ordersTable.customerEmail,
      name:      ordersTable.customerName,
      latestAt:  ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(eq(ordersTable.vendorId, vendor.id))
    .orderBy(ordersTable.customerEmail, desc(ordersTable.createdAt));

  // Last message per contact + unread count of inbound messages
  const msgStats = await db
    .select({
      email:       vendorCustomerMessagesTable.customerEmail,
      lastBody:    vendorCustomerMessagesTable.body,
      lastDir:     vendorCustomerMessagesTable.direction,
      lastAt:      vendorCustomerMessagesTable.createdAt,
      unread:      sql<number>`count(*) filter (where ${vendorCustomerMessagesTable.direction} = 'customer_to_vendor' and ${vendorCustomerMessagesTable.read} = false)`,
    })
    .from(vendorCustomerMessagesTable)
    .where(eq(vendorCustomerMessagesTable.vendorId, vendor.id))
    .groupBy(
      vendorCustomerMessagesTable.customerEmail,
      vendorCustomerMessagesTable.body,
      vendorCustomerMessagesTable.direction,
      vendorCustomerMessagesTable.createdAt,
    )
    .orderBy(vendorCustomerMessagesTable.customerEmail, desc(vendorCustomerMessagesTable.createdAt));

  // Merge: deduplicate by email, latest info wins
  const contactMap = new Map<string, {
    email: string; name?: string; latestAt: Date;
    lastBody?: string; lastDir?: string; lastMsgAt?: Date; unread: number;
  }>();

  for (const c of orderContacts) {
    contactMap.set(c.email, { email: c.email, name: c.name, latestAt: c.latestAt, unread: 0 });
  }

  for (const m of msgStats) {
    const existing = contactMap.get(m.email);
    if (existing) {
      existing.lastBody  = m.lastBody;
      existing.lastDir   = m.lastDir;
      existing.lastMsgAt = m.lastAt;
      existing.unread    = Number(m.unread);
    } else {
      contactMap.set(m.email, {
        email: m.email, latestAt: m.lastAt,
        lastBody: m.lastBody, lastDir: m.lastDir, lastMsgAt: m.lastAt,
        unread: Number(m.unread),
      });
    }
  }

  const contacts = Array.from(contactMap.values())
    .sort((a, b) => (b.lastMsgAt ?? b.latestAt).getTime() - (a.lastMsgAt ?? a.latestAt).getTime())
    .map(c => ({
      ...c,
      latestAt:   c.latestAt.toISOString(),
      lastMsgAt:  c.lastMsgAt?.toISOString() ?? null,
    }));

  res.json({ contacts });
});

// ── GET /vendor-messages/thread ────────────────────────────────────────────────
// Full message thread between this vendor and one customer email.

router.get("/vendor-messages/thread", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const email = (req.query.email as string)?.toLowerCase().trim();
  if (!email) { res.status(400).json({ error: "email query param required" }); return; }

  const msgs = await db
    .select()
    .from(vendorCustomerMessagesTable)
    .where(and(
      eq(vendorCustomerMessagesTable.vendorId, vendor.id),
      eq(vendorCustomerMessagesTable.customerEmail, email),
    ))
    .orderBy(vendorCustomerMessagesTable.createdAt);

  // Auto-mark all inbound messages as read when vendor opens thread
  await db.update(vendorCustomerMessagesTable)
    .set({ read: true, readAt: new Date() })
    .where(and(
      eq(vendorCustomerMessagesTable.vendorId, vendor.id),
      eq(vendorCustomerMessagesTable.customerEmail, email),
      eq(vendorCustomerMessagesTable.direction, "customer_to_vendor"),
      eq(vendorCustomerMessagesTable.read, false),
    ));

  res.json({
    messages: msgs.map(m => ({ ...m, createdAt: m.createdAt.toISOString(), readAt: m.readAt?.toISOString() ?? null })),
    customerEmail: email,
    customerName: msgs.find(m => m.customerName)?.customerName ?? email.split("@")[0],
  });
});

// ── POST /vendor-messages/send ────────────────────────────────────────────────
// Vendor sends a message to a customer. Delivers it as a customer notification
// if the customer has an Awa Biz Suite account, and optionally via email.

router.post("/vendor-messages/send", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { customerEmail, customerName, subject, body, sendEmailNotification } = req.body as {
    customerEmail: string; customerName?: string;
    subject?: string; body: string;
    sendEmailNotification?: boolean;
  };

  if (!customerEmail?.trim()) { res.status(400).json({ error: "customerEmail is required" }); return; }
  if (!body?.trim())          { res.status(400).json({ error: "body is required" }); return; }

  const email = customerEmail.trim().toLowerCase();

  // Look up customer account if it exists
  const [customer] = await db
    .select({ id: customersTable.id, name: customersTable.name })
    .from(customersTable)
    .where(eq(customersTable.email, email))
    .limit(1);

  // Save the message
  const [msg] = await db.insert(vendorCustomerMessagesTable).values({
    vendorId:      vendor.id,
    customerId:    customer?.id ?? null,
    customerEmail: email,
    customerName:  customerName?.trim() || customer?.name || email.split("@")[0],
    subject:       subject?.trim() || null,
    body:          body.trim(),
    direction:     "vendor_to_customer",
    read:          false,
  }).returning();

  // Deliver as in-app notification if customer has an account
  if (customer) {
    await db.insert(customerNotificationsTable).values({
      customerId: customer.id,
      type:       "vendor_message",
      title:      `📩 Message from ${vendor.name}${subject ? `: ${subject}` : ""}`,
      message:    body.trim().slice(0, 300),
      metadata:   { vendorId: vendor.id, vendorName: vendor.name, messageId: msg!.id },
    }).catch(() => {});
  }

  // Send email notification if requested
  if (sendEmailNotification !== false) {
    const subjectLine = subject?.trim() || `Message from ${vendor.name}`;
    const html = wrapVendorEmail({ bodyHtml:
      `<p style="font-size:16px;margin:0 0 16px">Hi ${customerName?.trim() || customer?.name || "there"},</p>
       <p style="font-size:15px;line-height:1.7;margin:0 0 20px;white-space:pre-wrap">${body.trim()}</p>
       <p style="font-size:13px;color:#9ca3af;margin:0">This message was sent to you by ${vendor.name} via Awa Biz Suite.</p>`
    });
    sendEmail({
      to:      email,
      subject: subjectLine,
      html,
    }).catch(() => {});
  }

  res.status(201).json({ message: { ...msg!, createdAt: msg!.createdAt.toISOString(), readAt: null } });
});

// ── PUT /vendor-messages/:id/read ─────────────────────────────────────────────

router.put("/vendor-messages/:id/read", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid message ID" }); return; }

  await db.update(vendorCustomerMessagesTable)
    .set({ read: true, readAt: new Date() })
    .where(and(
      eq(vendorCustomerMessagesTable.id, id),
      eq(vendorCustomerMessagesTable.vendorId, vendor.id),
    ));

  res.json({ ok: true });
});

// ── GET /vendor-messages/unread-count ─────────────────────────────────────────

router.get("/vendor-messages/unread-count", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(vendorCustomerMessagesTable)
    .where(and(
      eq(vendorCustomerMessagesTable.vendorId, vendor.id),
      eq(vendorCustomerMessagesTable.direction, "customer_to_vendor"),
      eq(vendorCustomerMessagesTable.read, false),
    ));

  res.json({ unread: Number(row?.count ?? 0) });
});
