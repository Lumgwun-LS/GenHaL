/**
 * Public Customer Activity routes — no Clerk auth required.
 *
 * GET /public/my-activity?email=xxx
 *   Returns all orders and blog comments associated with the given email
 *   address across ALL vendors on the platform.
 *
 *   Results are not sensitive enough to require authentication — the email
 *   address itself is the "key". Each item includes a direct link so the
 *   customer can continue from where they left off.
 */

import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderItemsTable,
  vendorsTable,
  vendorWebsitesTable,
  blogCommentsTable,
  blogPostsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

function getAppBaseUrl(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  return domain ? `https://${domain}` : "https://app.awabiz.com";
}

// ── GET /public/my-activity ───────────────────────────────────────────────────
router.get("/public/my-activity", async (req: any, res: any) => {
  try {
    const emailRaw = typeof req.query.email === "string" ? req.query.email.trim() : null;
    if (!emailRaw) {
      return void res.status(400).json({ error: "email query param required" });
    }
    const email = emailRaw.toLowerCase();

    // ── Orders ──────────────────────────────────────────────────────────────
    const orders = await db
      .select({
        id:            ordersTable.id,
        vendorId:      ordersTable.vendorId,
        vendorName:    vendorsTable.name,
        vendorLogoUrl: vendorsTable.logoUrl,
        siteSlug:      vendorWebsitesTable.slug,
        customerName:  ordersTable.customerName,
        status:        ordersTable.status,
        paymentStatus: ordersTable.paymentStatus,
        currency:      ordersTable.currency,
        totalAmount:   ordersTable.totalAmount,
        notes:         ordersTable.notes,
        createdAt:     ordersTable.createdAt,
        updatedAt:     ordersTable.updatedAt,
      })
      .from(ordersTable)
      .innerJoin(vendorsTable, eq(vendorsTable.id, ordersTable.vendorId))
      .leftJoin(vendorWebsitesTable, eq(vendorWebsitesTable.vendorId, ordersTable.vendorId))
      .where(eq(ordersTable.customerEmail, email))
      .orderBy(desc(ordersTable.createdAt))
      .limit(50);

    // Fetch items for each order (batched by order ids)
    const orderIds = orders.map((o) => o.id);
    const allItems =
      orderIds.length > 0
        ? await db
            .select({
              orderId:     orderItemsTable.orderId,
              productName: orderItemsTable.productName,
              quantity:    orderItemsTable.quantity,
              unitPrice:   orderItemsTable.unitPrice,
              totalPrice:  orderItemsTable.totalPrice,
            })
            .from(orderItemsTable)
            .where(
              orderIds.length === 1
                ? eq(orderItemsTable.orderId, orderIds[0])
                : (orderItemsTable.orderId as any).in(orderIds)
            )
        : [];

    const itemsByOrder = new Map<number, typeof allItems>();
    for (const item of allItems) {
      const list = itemsByOrder.get(item.orderId) ?? [];
      list.push(item);
      itemsByOrder.set(item.orderId, list);
    }

    const base = getAppBaseUrl();

    const serializedOrders = orders.map((o) => ({
      id:            o.id,
      vendorName:    o.vendorName,
      vendorLogoUrl: o.vendorLogoUrl,
      status:        o.status,
      paymentStatus: o.paymentStatus,
      currency:      o.currency,
      totalAmount:   Number(o.totalAmount).toFixed(2),
      notes:         o.notes,
      createdAt:     o.createdAt.toISOString(),
      updatedAt:     o.updatedAt.toISOString(),
      // Link: vendor shop page if they have a site, otherwise the activity page
      storeUrl:      o.siteSlug ? `${base}/vendor-hub/site/${encodeURIComponent(o.siteSlug)}` : null,
      items:         (itemsByOrder.get(o.id) ?? []).map((item) => ({
        productName: item.productName,
        quantity:    item.quantity,
        unitPrice:   Number(item.unitPrice).toFixed(2),
        totalPrice:  Number(item.totalPrice).toFixed(2),
      })),
    }));

    // ── Blog Comments ────────────────────────────────────────────────────────
    const comments = await db
      .select({
        id:           blogCommentsTable.id,
        body:         blogCommentsTable.body,
        createdAt:    blogCommentsTable.createdAt,
        postId:       blogPostsTable.id,
        postTitle:    blogPostsTable.title,
        postSlug:     blogPostsTable.slug,
        postStatus:   blogPostsTable.status,
        vendorId:     vendorsTable.id,
        vendorName:   vendorsTable.name,
        vendorLogoUrl:vendorsTable.logoUrl,
        siteSlug:     vendorWebsitesTable.slug,
      })
      .from(blogCommentsTable)
      .innerJoin(blogPostsTable, eq(blogPostsTable.id, blogCommentsTable.postId))
      .innerJoin(vendorsTable, eq(vendorsTable.id, blogCommentsTable.vendorId))
      .leftJoin(vendorWebsitesTable, eq(vendorWebsitesTable.vendorId, blogCommentsTable.vendorId))
      .where(eq(blogCommentsTable.commenterEmail, email))
      .orderBy(desc(blogCommentsTable.createdAt))
      .limit(100);

    const serializedComments = comments.map((c) => ({
      id:            c.id,
      body:          c.body,
      createdAt:     c.createdAt.toISOString(),
      postTitle:     c.postTitle,
      postStatus:    c.postStatus,
      vendorName:    c.vendorName,
      vendorLogoUrl: c.vendorLogoUrl,
      // Link to the public blog post
      postUrl:       c.siteSlug
        ? `${base}/vendor-hub/public-blog/${encodeURIComponent(c.siteSlug)}/${encodeURIComponent(c.postSlug)}`
        : null,
    }));

    res.json({
      email,
      orders:   serializedOrders,
      comments: serializedComments,
    });
  } catch (err) {
    logger.error({ err }, "GET /public/my-activity error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
