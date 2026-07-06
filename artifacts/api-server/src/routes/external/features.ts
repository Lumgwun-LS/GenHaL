/**
 * /external/features/* — feature routes accessible to Awajimaa users.
 *
 * Each route checks that the authenticated user's type has access to
 * the requested feature before proxying the query to the core tables.
 *
 * Feature → allowed user types:
 *   analytics  → state, business
 *   campaigns  → state, hospital, business
 *   social     → all
 *   leads      → all
 *   inventory  → hospital, emergency, business
 *   orders     → hospital, business, individual
 *   products   → hospital, business
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  postsTable,
  leadsTable,
  productsTable,
  inventoryTransactionsTable,
  ordersTable,
  emailCampaignsTable,
  smsCampaignsTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireExternalAuth, FEATURE_ACCESS } from "../../middlewares/requireExternalAuth";

const router = Router();
router.use(requireExternalAuth);

/** Guard helper — sends 403 if the user type lacks the feature */
function requireFeature(feature: string) {
  return (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction): void => {
    const userType = req.externalUser!.awajimaaUserType;
    if (!FEATURE_ACCESS[userType]?.includes(feature)) {
      res.status(403).json({
        error: `Feature '${feature}' is not available for user type '${userType}'`,
        availableFeatures: FEATURE_ACCESS[userType] ?? [],
      });
      return;
    }
    next();
  };
}

// ─── Social Posts ────────────────────────────────────────────────────────────

router.get("/social/posts", requireFeature("social"), async (req, res) => {
  const { vendorId } = req.externalUser!;
  const posts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.vendorId, vendorId))
    .orderBy(desc(postsTable.createdAt))
    .limit(50);
  res.json(posts);
});

router.post("/social/posts", requireFeature("social"), async (req, res) => {
  const { vendorId } = req.externalUser!;
  const { content, platforms, scheduledAt } = req.body as {
    content: string;
    platforms: string[];
    scheduledAt?: string;
  };
  if (!content || !platforms?.length) {
    return res.status(400).json({ error: "content and platforms are required" });
  }
  const [post] = await db
    .insert(postsTable)
    .values({
      vendorId,
      caption: content,
      platforms,
      status: scheduledAt ? "scheduled" : "draft",
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    })
    .returning();
  return res.status(201).json(post);
});

// ─── Leads ───────────────────────────────────────────────────────────────────

router.get("/leads", requireFeature("leads"), async (req, res) => {
  const { vendorId } = req.externalUser!;
  const leads = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.vendorId, vendorId))
    .orderBy(desc(leadsTable.createdAt))
    .limit(100);
  res.json(leads);
});

router.post("/leads", requireFeature("leads"), async (req, res) => {
  const { vendorId } = req.externalUser!;
  const { name, email, phone, source, notes } = req.body as {
    name: string;
    email?: string;
    phone?: string;
    source?: string;
    notes?: string;
  };
  if (!name) return res.status(400).json({ error: "name is required" });
  const [lead] = await db
    .insert(leadsTable)
    .values({
      vendorId,
      name,
      email: email ?? null,
      phone: phone ?? null,
      source: source ?? "awajimaa-app",
      status: "new",
      score: 0,
      notes: notes ?? null,
    })
    .returning();
  return res.status(201).json(lead);
});

// ─── Products ────────────────────────────────────────────────────────────────

router.get("/products", requireFeature("products"), async (req, res) => {
  const { vendorId } = req.externalUser!;
  const products = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.vendorId, vendorId))
    .orderBy(desc(productsTable.createdAt))
    .limit(100);
  res.json(products);
});

// ─── Inventory ───────────────────────────────────────────────────────────────

router.get("/inventory", requireFeature("inventory"), async (req, res) => {
  const { vendorId } = req.externalUser!;
  const txs = await db
    .select()
    .from(inventoryTransactionsTable)
    .where(eq(inventoryTransactionsTable.vendorId, vendorId))
    .orderBy(desc(inventoryTransactionsTable.createdAt))
    .limit(100);
  res.json(txs);
});

// ─── Orders ──────────────────────────────────────────────────────────────────

router.get("/orders", requireFeature("orders"), async (req, res) => {
  const { vendorId } = req.externalUser!;
  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.vendorId, vendorId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(100);
  res.json(orders);
});

// ─── Campaigns ───────────────────────────────────────────────────────────────

router.get("/campaigns/email", requireFeature("campaigns"), async (req, res) => {
  const { vendorId } = req.externalUser!;
  const campaigns = await db
    .select()
    .from(emailCampaignsTable)
    .where(eq(emailCampaignsTable.vendorId, vendorId))
    .orderBy(desc(emailCampaignsTable.createdAt))
    .limit(50);
  res.json(campaigns);
});

router.get("/campaigns/sms", requireFeature("campaigns"), async (req, res) => {
  const { vendorId } = req.externalUser!;
  const campaigns = await db
    .select()
    .from(smsCampaignsTable)
    .where(eq(smsCampaignsTable.vendorId, vendorId))
    .orderBy(desc(smsCampaignsTable.createdAt))
    .limit(50);
  res.json(campaigns);
});

// ─── Analytics (summary) ─────────────────────────────────────────────────────

router.get("/analytics/summary", requireFeature("analytics"), async (req, res) => {
  const { vendorId } = req.externalUser!;
  const [leadsCount, ordersCount, productsCount] = await Promise.all([
    db.select().from(leadsTable).where(eq(leadsTable.vendorId, vendorId)).then((r) => r.length),
    db.select().from(ordersTable).where(eq(ordersTable.vendorId, vendorId)).then((r) => r.length),
    db.select().from(productsTable).where(eq(productsTable.vendorId, vendorId)).then((r) => r.length),
  ]);
  res.json({ vendorId, leadsCount, ordersCount, productsCount });
});

export default router;
