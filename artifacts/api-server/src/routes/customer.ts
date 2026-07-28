/**
 * Customer portal routes — authenticated via Clerk (same instance as vendors).
 * A "customer" is any Clerk user who has purchased from a vendor or signed up
 * via the customer portal. They are distinct from vendor accounts.
 *
 * Routes:
 *   POST /api/customer/onboarding          — create / link customer profile
 *   GET  /api/customer/me                  — fetch profile
 *   PUT  /api/customer/me                  — update profile
 *   GET  /api/customer/orders              — order history (by customerId or email)
 *   GET  /api/customer/orders/:id          — single order with items
 *   GET  /api/customer/vendors             — distinct vendors this customer bought from
 *   GET  /api/customer/notifications       — inbox
 *   PUT  /api/customer/notifications/read-all — mark all read
 *   PUT  /api/customer/notifications/:id/read — mark one read
 *   POST /api/customer/link-orders         — claim historical guest orders by email
 */

import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  db,
  customersTable,
  customerNotificationsTable,
  ordersTable,
  orderItemsTable,
  vendorsTable,
} from "@workspace/db";

const router: IRouter = Router();
export default router;

// ── Auth helper ────────────────────────────────────────────────────────────────

async function resolveCustomer(req: import("express").Request) {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const [customer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.clerkUserId, userId))
    .limit(1);
  return customer ?? null;
}

// ── POST /api/customer/onboarding ─────────────────────────────────────────────
// Create a customer record for the signed-in Clerk user (idempotent).

router.post("/customer/onboarding", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { name, email, phone, country, city, address, avatarUrl } = req.body as {
    name?: string; email?: string; phone?: string; country?: string;
    city?: string; address?: string; avatarUrl?: string;
  };

  if (!name?.trim() || !email?.trim()) {
    res.status(400).json({ error: "name and email are required" }); return;
  }

  // Check for existing customer
  const [existing] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.clerkUserId, userId))
    .limit(1);

  if (existing) {
    // Update any new fields provided
    const updates: Partial<typeof customersTable.$inferInsert> = {};
    if (name.trim())     updates.name      = name.trim();
    if (phone?.trim())   updates.phone     = phone.trim();
    if (country?.trim()) updates.country   = country.trim();
    if (city?.trim())    updates.city      = city.trim();
    if (address?.trim()) updates.address   = address.trim();
    if (avatarUrl)       updates.avatarUrl = avatarUrl;

    const profileCompleted = !!(
      (existing.phone || phone?.trim()) &&
      (existing.country || country?.trim()) &&
      (existing.city || city?.trim())
    );
    updates.profileCompleted = profileCompleted;

    const [updated] = await db.update(customersTable).set(updates).where(eq(customersTable.id, existing.id)).returning();
    res.json({ customer: updated, alreadyExisted: true }); return;
  }

  const profileCompleted = !!(phone?.trim() && country?.trim() && city?.trim());
  const [created] = await db.insert(customersTable).values({
    clerkUserId: userId,
    email: email.trim().toLowerCase(),
    name: name.trim(),
    phone: phone?.trim() ?? null,
    country: country?.trim() ?? null,
    city: city?.trim() ?? null,
    address: address?.trim() ?? null,
    avatarUrl: avatarUrl ?? null,
    profileCompleted,
  }).returning();

  // Auto-link any guest orders placed with this email
  if (created) {
    await db.update(ordersTable)
      .set({ customerId: created.id })
      .where(and(
        eq(ordersTable.customerEmail, created.email),
        // only un-claimed orders
        eq(ordersTable.customerId as unknown as typeof ordersTable.id, null as unknown as number),
      )).catch(() => {}); // non-fatal

    // Welcome notification
    await db.insert(customerNotificationsTable).values({
      customerId: created.id,
      type: "system",
      title: "Welcome to Awa Biz Suite! 🎉",
      message: "Your customer account is ready. Browse your order history, discover vendors, and unlock the Awajimaa AI Dashboard by completing your profile.",
    }).catch(() => {});
  }

  res.status(201).json({ customer: created });
});

// ── GET /api/customer/me ──────────────────────────────────────────────────────

router.get("/customer/me", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [customer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.clerkUserId, userId))
    .limit(1);

  if (!customer) { res.status(404).json({ error: "No customer profile found", code: "NOT_ONBOARDED" }); return; }

  res.json({
    ...customer,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  });
});

// ── PUT /api/customer/me ──────────────────────────────────────────────────────

router.put("/customer/me", async (req, res): Promise<void> => {
  const customer = await resolveCustomer(req);
  if (!customer) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { name, phone, country, city, address, bio, avatarUrl } = req.body as {
    name?: string; phone?: string; country?: string; city?: string;
    address?: string; bio?: string; avatarUrl?: string;
  };

  const updates: Partial<typeof customersTable.$inferInsert> = {};
  if (name?.trim())    updates.name    = name.trim();
  if (phone !== undefined) updates.phone = phone?.trim() || null;
  if (country !== undefined) updates.country = country?.trim() || null;
  if (city !== undefined)    updates.city    = city?.trim() || null;
  if (address !== undefined) updates.address = address?.trim() || null;
  if (bio !== undefined)     updates.bio     = bio?.trim() || null;
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl || null;

  // Recompute profileCompleted
  const merged = { ...customer, ...updates };
  updates.profileCompleted = !!(merged.phone && merged.country && merged.city);

  const [updated] = await db.update(customersTable).set(updates).where(eq(customersTable.id, customer.id)).returning();
  res.json({
    ...updated,
    createdAt: updated!.createdAt.toISOString(),
    updatedAt: updated!.updatedAt.toISOString(),
  });
});

// ── GET /api/customer/orders ──────────────────────────────────────────────────
// Returns all orders linked to this customer account OR placed with their email.

router.get("/customer/orders", async (req, res): Promise<void> => {
  const customer = await resolveCustomer(req);
  if (!customer) { res.status(401).json({ error: "Unauthorized" }); return; }

  const page  = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      id: ordersTable.id,
      vendorId: ordersTable.vendorId,
      vendorName: vendorsTable.name,
      vendorLogoUrl: vendorsTable.logoUrl,
      status: ordersTable.status,
      paymentStatus: ordersTable.paymentStatus,
      currency: ordersTable.currency,
      totalAmount: ordersTable.totalAmount,
      source: ordersTable.source,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .leftJoin(vendorsTable, eq(ordersTable.vendorId, vendorsTable.id))
    .where(and(
      eq(ordersTable.customerId, customer.id),
    ))
    .orderBy(desc(ordersTable.createdAt))
    .limit(limit)
    .offset(offset);

  // Also pull any unclaimed orders with matching email
  const unclaimedRows = await db
    .select({
      id: ordersTable.id,
      vendorId: ordersTable.vendorId,
      vendorName: vendorsTable.name,
      vendorLogoUrl: vendorsTable.logoUrl,
      status: ordersTable.status,
      paymentStatus: ordersTable.paymentStatus,
      currency: ordersTable.currency,
      totalAmount: ordersTable.totalAmount,
      source: ordersTable.source,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .leftJoin(vendorsTable, eq(ordersTable.vendorId, vendorsTable.id))
    .where(and(
      eq(ordersTable.customerEmail, customer.email),
      // @ts-ignore — nullable comparison
      eq(ordersTable.customerId, null),
    ))
    .orderBy(desc(ordersTable.createdAt));

  // Auto-link unclaimed orders in background
  if (unclaimedRows.length) {
    const ids = unclaimedRows.map(r => r.id);
    db.update(ordersTable).set({ customerId: customer.id }).where(inArray(ordersTable.id, ids)).catch(() => {});
  }

  const all = [...rows, ...unclaimedRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const seen = new Set<number>();
  const unique = all.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });

  res.json({
    orders: unique.slice(0, limit).map(o => ({
      ...o,
      totalAmount: parseFloat(o.totalAmount as string),
      createdAt: o.createdAt.toISOString(),
    })),
    page,
  });
});

// ── GET /api/customer/orders/:id ──────────────────────────────────────────────

router.get("/customer/orders/:id", async (req, res): Promise<void> => {
  const customer = await resolveCustomer(req);
  if (!customer) { res.status(401).json({ error: "Unauthorized" }); return; }

  const orderId = parseInt(req.params.id);
  if (isNaN(orderId)) { res.status(400).json({ error: "Invalid order ID" }); return; }

  const [order] = await db
    .select()
    .from(ordersTable)
    .leftJoin(vendorsTable, eq(ordersTable.vendorId, vendorsTable.id))
    .where(and(
      eq(ordersTable.id, orderId),
      eq(ordersTable.customerEmail, customer.email),
    ))
    .limit(1);

  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));

  res.json({
    ...order.orders,
    vendor: order.vendors ? { name: order.vendors.name, logoUrl: order.vendors.logoUrl } : null,
    items: items.map(i => ({
      ...i,
      unitPrice: parseFloat(i.unitPrice as string),
      totalPrice: parseFloat(i.totalPrice as string),
    })),
    totalAmount: parseFloat(order.orders.totalAmount as string),
    createdAt: order.orders.createdAt.toISOString(),
    updatedAt: order.orders.updatedAt.toISOString(),
  });
});

// ── GET /api/customer/vendors ─────────────────────────────────────────────────
// Unique vendors this customer has ordered from.

router.get("/customer/vendors", async (req, res): Promise<void> => {
  const customer = await resolveCustomer(req);
  if (!customer) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .selectDistinctOn([ordersTable.vendorId], {
      vendorId: ordersTable.vendorId,
      vendorName: vendorsTable.name,
      vendorLogoUrl: vendorsTable.logoUrl,
      vendorEmail: vendorsTable.email,
      vendorPhone: vendorsTable.phone,
      vendorAddress: vendorsTable.address,
      latestOrderAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .leftJoin(vendorsTable, eq(ordersTable.vendorId, vendorsTable.id))
    .where(eq(ordersTable.customerEmail, customer.email))
    .orderBy(ordersTable.vendorId, desc(ordersTable.createdAt));

  res.json({
    vendors: rows.map(v => ({
      vendorId: v.vendorId,
      name: v.vendorName,
      logoUrl: v.vendorLogoUrl,
      email: v.vendorEmail,
      phone: v.vendorPhone,
      address: v.vendorAddress,
      latestOrderAt: v.latestOrderAt.toISOString(),
    })),
  });
});

// ── GET /api/customer/notifications ──────────────────────────────────────────

router.get("/customer/notifications", async (req, res): Promise<void> => {
  const customer = await resolveCustomer(req);
  if (!customer) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .select()
    .from(customerNotificationsTable)
    .where(eq(customerNotificationsTable.customerId, customer.id))
    .orderBy(desc(customerNotificationsTable.createdAt))
    .limit(50);

  res.json({
    notifications: rows.map(n => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount: rows.filter(n => !n.read).length,
  });
});

// ── PUT /api/customer/notifications/read-all ──────────────────────────────────

router.put("/customer/notifications/read-all", async (req, res): Promise<void> => {
  const customer = await resolveCustomer(req);
  if (!customer) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db.update(customerNotificationsTable)
    .set({ read: true })
    .where(and(
      eq(customerNotificationsTable.customerId, customer.id),
      eq(customerNotificationsTable.read, false),
    ));

  res.json({ ok: true });
});

// ── PUT /api/customer/notifications/:id/read ─────────────────────────────────

router.put("/customer/notifications/:id/read", async (req, res): Promise<void> => {
  const customer = await resolveCustomer(req);
  if (!customer) { res.status(401).json({ error: "Unauthorized" }); return; }

  const nid = parseInt(req.params.id);
  if (isNaN(nid)) { res.status(400).json({ error: "Invalid notification ID" }); return; }

  await db.update(customerNotificationsTable)
    .set({ read: true })
    .where(and(
      eq(customerNotificationsTable.id, nid),
      eq(customerNotificationsTable.customerId, customer.id),
    ));

  res.json({ ok: true });
});

// ── POST /api/customer/link-orders ────────────────────────────────────────────
// Claim any guest orders placed with this customer's email.

router.post("/customer/link-orders", async (req, res): Promise<void> => {
  const customer = await resolveCustomer(req);
  if (!customer) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.customerEmail, customer.email),
      // @ts-ignore — nullable comparison
      eq(ordersTable.customerId, null),
    ));

  if (rows.length === 0) { res.json({ linked: 0 }); return; }

  await db.update(ordersTable)
    .set({ customerId: customer.id })
    .where(inArray(ordersTable.id, rows.map(r => r.id)));

  res.json({ linked: rows.length });
});
