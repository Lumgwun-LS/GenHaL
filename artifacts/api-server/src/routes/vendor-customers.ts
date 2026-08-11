/**
 * Vendor → Customer 360 view.
 *
 * Routes (all require Clerk auth + vendor ownership):
 *   GET  /vendor-customers              — paginated list of unique customers
 *   GET  /vendor-customers/profile      — full 360 detail for one customer (?email=)
 */

import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, desc, sql, inArray, count } from "drizzle-orm";
import {
  db,
  vendorsTable,
  ordersTable,
  orderItemsTable,
  invoicesTable,
  invoiceItemsTable,
  paymentsTable,
  supportTicketsTable,
  supportTicketMessagesTable,
  vendorCustomerMessagesTable,
  customersTable,
} from "@workspace/db";

const router: IRouter = Router();

// ── Auth helper ────────────────────────────────────────────────────────────────
async function resolveAuthedVendor(req: import("express").Request) {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const [v] = await db
    .select({ id: vendorsTable.id, name: vendorsTable.name })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, userId))
    .limit(1);
  return v ?? null;
}

// ── GET /vendor-customers ──────────────────────────────────────────────────────
// Returns unique customers across orders, tickets, and messages, with stats.

router.get("/vendor-customers", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { search } = req.query as { search?: string };
  const q = search?.trim().toLowerCase();

  // --- Orders aggregate per customer email ---
  const orderAgg = await db
    .select({
      email:      ordersTable.customerEmail,
      name:       ordersTable.customerName,
      currency:   ordersTable.currency,
      orderCount: sql<number>`count(*)`.mapWith(Number),
      totalSpent: sql<string>`sum(${ordersTable.totalAmount}::numeric)`,
      lastOrderAt: sql<Date>`max(${ordersTable.createdAt})`,
    })
    .from(ordersTable)
    .where(eq(ordersTable.vendorId, vendor.id))
    .groupBy(ordersTable.customerEmail, ordersTable.customerName, ordersTable.currency)
    .orderBy(desc(sql`max(${ordersTable.createdAt})`));

  // --- Ticket aggregate ---
  const ticketAgg = await db
    .select({
      email:      supportTicketsTable.customerEmail,
      total:      sql<number>`count(*)`.mapWith(Number),
      open:       sql<number>`count(*) filter (where ${supportTicketsTable.status} in ('open','pending'))`.mapWith(Number),
      lastAt:     sql<Date>`max(${supportTicketsTable.createdAt})`,
    })
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.vendorId, vendor.id))
    .groupBy(supportTicketsTable.customerEmail);

  // --- Message aggregate ---
  const msgAgg = await db
    .select({
      email:        vendorCustomerMessagesTable.customerEmail,
      name:         vendorCustomerMessagesTable.customerName,
      total:        sql<number>`count(*)`.mapWith(Number),
      unread:       sql<number>`count(*) filter (where ${vendorCustomerMessagesTable.direction} = 'customer_to_vendor' and ${vendorCustomerMessagesTable.read} = false)`.mapWith(Number),
      lastAt:       sql<Date>`max(${vendorCustomerMessagesTable.createdAt})`,
    })
    .from(vendorCustomerMessagesTable)
    .where(eq(vendorCustomerMessagesTable.vendorId, vendor.id))
    .groupBy(vendorCustomerMessagesTable.customerEmail, vendorCustomerMessagesTable.customerName);

  // --- Merge by email ---
  type CustomerRow = {
    email: string; name: string; currency: string;
    orderCount: number; totalSpent: number;
    ticketCount: number; openTickets: number;
    unreadMessages: number; totalMessages: number;
    lastActivityAt: Date | null;
    sources: string[];
  };
  const map = new Map<string, CustomerRow>();

  const upsert = (email: string, fn: (r: CustomerRow) => void) => {
    const key = email.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { email: key, name: "", currency: "USD", orderCount: 0, totalSpent: 0, ticketCount: 0, openTickets: 0, unreadMessages: 0, totalMessages: 0, lastActivityAt: null, sources: [] });
    }
    fn(map.get(key)!);
  };

  for (const r of orderAgg) {
    const key = r.email.toLowerCase();
    upsert(key, row => {
      row.email = key;
      if (!row.name) row.name = r.name;
      row.currency = r.currency;
      row.orderCount += r.orderCount;
      row.totalSpent += parseFloat(r.totalSpent ?? "0");
      if (r.lastOrderAt && (!row.lastActivityAt || r.lastOrderAt > row.lastActivityAt)) row.lastActivityAt = r.lastOrderAt;
      if (!row.sources.includes("orders")) row.sources.push("orders");
    });
  }

  for (const r of ticketAgg) {
    if (!r.email) continue;
    const key = r.email.toLowerCase();
    upsert(key, row => {
      row.ticketCount += r.total;
      row.openTickets += r.open;
      if (r.lastAt && (!row.lastActivityAt || r.lastAt > row.lastActivityAt)) row.lastActivityAt = r.lastAt;
      if (!row.sources.includes("tickets")) row.sources.push("tickets");
    });
  }

  for (const r of msgAgg) {
    const key = r.email.toLowerCase();
    upsert(key, row => {
      if (!row.name && r.name) row.name = r.name;
      row.totalMessages += r.total;
      row.unreadMessages += r.unread;
      if (r.lastAt && (!row.lastActivityAt || r.lastAt > row.lastActivityAt)) row.lastActivityAt = r.lastAt;
      if (!row.sources.includes("messages")) row.sources.push("messages");
    });
  }

  // Resolve any platform accounts for avatars
  const allEmails = Array.from(map.keys());
  const accounts = allEmails.length
    ? await db.select({ email: customersTable.email, name: customersTable.name, avatarUrl: customersTable.avatarUrl })
        .from(customersTable).where(inArray(customersTable.email, allEmails))
    : [];
  for (const a of accounts) {
    const row = map.get(a.email.toLowerCase());
    if (row) {
      if (!row.name) row.name = a.name;
    }
  }
  const avatarMap = new Map(accounts.map(a => [a.email.toLowerCase(), a.avatarUrl ?? null]));

  let customers = Array.from(map.values())
    .sort((a, b) => (b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0))
    .map(r => ({
      ...r,
      name: r.name || r.email.split("@")[0],
      totalSpent: r.totalSpent.toFixed(2),
      avatarUrl: avatarMap.get(r.email) ?? null,
      lastActivityAt: r.lastActivityAt?.toISOString() ?? null,
    }));

  if (q) {
    customers = customers.filter(c => c.email.includes(q) || c.name.toLowerCase().includes(q));
  }

  res.json({ customers });
});

// ── GET /vendor-customers/profile?email= ──────────────────────────────────────
// Full 360 profile for a single customer.

router.get("/vendor-customers/profile", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { email } = req.query as { email?: string };
  if (!email?.trim()) { res.status(400).json({ error: "email required" }); return; }
  const normalised = email.trim().toLowerCase();

  // Run all queries in parallel
  const [
    platformAccount,
    orders,
    invoices,
    tickets,
    messages,
    payments,
  ] = await Promise.all([
    // Platform account (if registered)
    db.select()
      .from(customersTable)
      .where(eq(customersTable.email, normalised))
      .limit(1)
      .then(r => r[0] ?? null),

    // Orders
    db.select({
      id: ordersTable.id, status: ordersTable.status,
      paymentStatus: ordersTable.paymentStatus,
      currency: ordersTable.currency, totalAmount: ordersTable.totalAmount,
      createdAt: ordersTable.createdAt, updatedAt: ordersTable.updatedAt,
      notes: ordersTable.notes,
    })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.vendorId, vendor.id),
        eq(sql`lower(${ordersTable.customerEmail})`, normalised),
      ))
      .orderBy(desc(ordersTable.createdAt)),

    // Invoices
    db.select({
      id: invoicesTable.id,
      status: invoicesTable.status, currency: invoicesTable.currency,
      totalAmount: invoicesTable.totalAmount, dueDate: invoicesTable.dueDate,
      createdAt: invoicesTable.createdAt,
    })
      .from(invoicesTable)
      .where(and(
        eq(invoicesTable.vendorId, vendor.id),
        eq(sql`lower(${invoicesTable.customerEmail})`, normalised),
      ))
      .orderBy(desc(invoicesTable.createdAt)),

    // Support tickets
    db.select({
      id: supportTicketsTable.id,
      subject: supportTicketsTable.subject, category: supportTicketsTable.category,
      status: supportTicketsTable.status, priority: supportTicketsTable.priority,
      createdAt: supportTicketsTable.createdAt, updatedAt: supportTicketsTable.updatedAt,
    })
      .from(supportTicketsTable)
      .where(and(
        eq(supportTicketsTable.vendorId, vendor.id),
        eq(sql`lower(${supportTicketsTable.customerEmail})`, normalised),
      ))
      .orderBy(desc(supportTicketsTable.createdAt)),

    // Messages
    db.select({
      id: vendorCustomerMessagesTable.id,
      direction: vendorCustomerMessagesTable.direction,
      subject: vendorCustomerMessagesTable.subject,
      body: vendorCustomerMessagesTable.body,
      read: vendorCustomerMessagesTable.read,
      createdAt: vendorCustomerMessagesTable.createdAt,
    })
      .from(vendorCustomerMessagesTable)
      .where(and(
        eq(vendorCustomerMessagesTable.vendorId, vendor.id),
        eq(sql`lower(${vendorCustomerMessagesTable.customerEmail})`, normalised),
      ))
      .orderBy(vendorCustomerMessagesTable.createdAt),

    // Payments
    db.select({
      id: paymentsTable.id, provider: paymentsTable.provider,
      providerReference: paymentsTable.providerReference,
      amount: paymentsTable.amount, currency: paymentsTable.currency,
      status: paymentsTable.status, orderId: paymentsTable.orderId,
      createdAt: paymentsTable.createdAt,
    })
      .from(paymentsTable)
      .innerJoin(ordersTable, eq(paymentsTable.orderId, ordersTable.id))
      .where(and(
        eq(ordersTable.vendorId, vendor.id),
        eq(sql`lower(${ordersTable.customerEmail})`, normalised),
      ))
      .orderBy(desc(paymentsTable.createdAt)),
  ]);

  // Fetch order items for all orders
  const orderIds = orders.map(o => o.id);
  const orderItems = orderIds.length
    ? await db.select({
        id: orderItemsTable.id, orderId: orderItemsTable.orderId,
        productName: orderItemsTable.productName, quantity: orderItemsTable.quantity,
        unitPrice: orderItemsTable.unitPrice, totalPrice: orderItemsTable.totalPrice,
      }).from(orderItemsTable).where(inArray(orderItemsTable.orderId, orderIds))
    : [];
  const itemsByOrder = new Map<number, typeof orderItems>();
  for (const item of orderItems) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
    itemsByOrder.get(item.orderId)!.push(item);
  }

  // Derive a display name from available data
  const firstName = orders[0] ? orders[0] : null; // just for types
  const displayName =
    platformAccount?.name ||
    messages.find(m => m.direction === "customer_to_vendor")?.subject?.split(" ")?.[0] ||
    normalised.split("@")[0];

  // Mark all unread inbound messages as read since vendor is viewing
  if (messages.some(m => m.direction === "customer_to_vendor" && !m.read)) {
    await db.update(vendorCustomerMessagesTable)
      .set({ read: true, readAt: new Date() })
      .where(and(
        eq(vendorCustomerMessagesTable.vendorId, vendor.id),
        eq(sql`lower(${vendorCustomerMessagesTable.customerEmail})`, normalised),
        eq(vendorCustomerMessagesTable.direction, "customer_to_vendor"),
        eq(vendorCustomerMessagesTable.read, false),
      ));
  }

  const ser = (d: Date | string | null | undefined) =>
    d ? (typeof d === "string" ? d : d.toISOString()) : null;

  res.json({
    email: normalised,
    displayName,
    platformAccount: platformAccount ? {
      id:              platformAccount.id,
      name:            platformAccount.name,
      phone:           platformAccount.phone ?? null,
      avatarUrl:       platformAccount.avatarUrl ?? null,
      city:            platformAccount.city ?? null,
      country:         platformAccount.country ?? null,
      bio:             platformAccount.bio ?? null,
      profileCompleted: platformAccount.profileCompleted,
      createdAt:       ser(platformAccount.createdAt),
    } : null,
    orders: orders.map(o => ({
      ...o,
      totalAmount: String(o.totalAmount),
      items: (itemsByOrder.get(o.id) ?? []).map(i => ({
        ...i, unitPrice: String(i.unitPrice), totalPrice: String(i.totalPrice),
      })),
      createdAt: ser(o.createdAt), updatedAt: ser(o.updatedAt),
    })),
    invoices: invoices.map(i => ({
      ...i,
      totalAmount: String(i.totalAmount),
      createdAt: ser(i.createdAt),
    })),
    tickets: tickets.map(t => ({
      ...t,
      createdAt: ser(t.createdAt), updatedAt: ser(t.updatedAt),
    })),
    messages: messages.map(m => ({
      ...m,
      createdAt: ser(m.createdAt),
    })),
    payments: payments.map(p => ({
      ...p,
      amount: String(p.amount),
      createdAt: ser(p.createdAt),
    })),
  });
});

export default router;
