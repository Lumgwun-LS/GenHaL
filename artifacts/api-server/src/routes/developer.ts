/**
 * Vendor self-service developer routes — API key management and webhook endpoints.
 * These are standard Clerk-authenticated routes (requireAuth applied upstream).
 *
 * GET    /developer/api-keys          — list vendor's API keys (no raw values)
 * POST   /developer/api-keys          — create a new key; raw key returned ONCE
 * DELETE /developer/api-keys/:id      — revoke a key
 * GET    /developer/webhooks          — list webhook endpoints
 * POST   /developer/webhooks          — register a new endpoint
 * PATCH  /developer/webhooks/:id      — toggle active / update events
 * DELETE /developer/webhooks/:id      — remove endpoint
 * POST   /developer/webhooks/:id/test — fire a test payload
 */

import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { getAuth } from "@clerk/express";
import { db, vendorsTable, vendorApiKeysTable, vendorWebhookEndpointsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function sha256(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

async function resolveVendor(req: import("express").Request, res: import("express").Response) {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.clerkUserId, userId)).limit(1);
  if (!vendor) { res.status(404).json({ error: "Vendor profile not found" }); return null; }
  return vendor;
}

const MAX_KEYS = 10;
const MAX_WEBHOOKS = 10;
export const AVAILABLE_SCOPES = ["read", "write:posts", "write:leads", "write:products", "write:orders", "write:inventory", "write:campaigns", "analytics"];

// ── API Keys ──────────────────────────────────────────────────────────────────

router.get("/developer/api-keys", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req, res);
  if (!vendor) return;

  const keys = await db
    .select({
      id: vendorApiKeysTable.id,
      name: vendorApiKeysTable.name,
      prefix: vendorApiKeysTable.prefix,
      scopes: vendorApiKeysTable.scopes,
      isActive: vendorApiKeysTable.isActive,
      lastUsedAt: vendorApiKeysTable.lastUsedAt,
      expiresAt: vendorApiKeysTable.expiresAt,
      createdAt: vendorApiKeysTable.createdAt,
      revokedAt: vendorApiKeysTable.revokedAt,
    })
    .from(vendorApiKeysTable)
    .where(eq(vendorApiKeysTable.vendorId, vendor.id))
    .orderBy(vendorApiKeysTable.createdAt);

  res.json(keys.map((k) => ({
    ...k,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    expiresAt:  k.expiresAt?.toISOString()  ?? null,
    createdAt:  k.createdAt?.toISOString()  ?? null,
    revokedAt:  k.revokedAt?.toISOString()  ?? null,
  })));
});

router.post("/developer/api-keys", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req, res);
  if (!vendor) return;

  const existing = await db.select({ id: vendorApiKeysTable.id })
    .from(vendorApiKeysTable)
    .where(and(eq(vendorApiKeysTable.vendorId, vendor.id), eq(vendorApiKeysTable.isActive, true)));
  if (existing.length >= MAX_KEYS) {
    res.status(400).json({ error: `Maximum of ${MAX_KEYS} active API keys allowed` });
    return;
  }

  const { name, scopes = ["read"] } = req.body as { name?: string; scopes?: string[] };
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }

  const invalidScopes = (scopes as string[]).filter((s) => !AVAILABLE_SCOPES.includes(s));
  if (invalidScopes.length) {
    res.status(400).json({ error: `Invalid scopes: ${invalidScopes.join(", ")}. Available: ${AVAILABLE_SCOPES.join(", ")}` });
    return;
  }

  // Generate key: awa_sk_<48 random hex chars>
  const rawKey = `awa_sk_${randomBytes(24).toString("hex")}`;
  const keyHash = sha256(rawKey);
  const prefix  = rawKey.slice(0, 14); // "awa_sk_" + 7 chars

  const [key] = await db.insert(vendorApiKeysTable).values({
    vendorId: vendor.id,
    name: name.trim(),
    keyHash,
    prefix,
    scopes: scopes as string[],
    isActive: true,
  }).returning();

  res.status(201).json({
    id:        key.id,
    name:      key.name,
    prefix:    key.prefix,
    scopes:    key.scopes,
    createdAt: key.createdAt?.toISOString(),
    rawKey, // ⚠️ Shown ONCE — cannot be retrieved again
  });
});

router.delete("/developer/api-keys/:id", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req, res);
  if (!vendor) return;

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [key] = await db.select().from(vendorApiKeysTable)
    .where(and(eq(vendorApiKeysTable.id, id), eq(vendorApiKeysTable.vendorId, vendor.id)));
  if (!key) { res.status(404).json({ error: "API key not found" }); return; }

  await db.update(vendorApiKeysTable)
    .set({ isActive: false, revokedAt: new Date() })
    .where(eq(vendorApiKeysTable.id, id));

  res.json({ ok: true });
});

// ── Webhooks ─────────────────────────────────────────────────────────────────

const SUPPORTED_EVENTS = [
  "*",
  "order.created", "order.paid", "order.cancelled",
  "lead.created", "lead.updated",
  "payment.succeeded", "payment.failed",
  "post.published", "post.failed",
  "product.created", "product.updated", "product.deleted",
];

router.get("/developer/webhooks", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req, res);
  if (!vendor) return;

  const rows = await db.select({
    id:               vendorWebhookEndpointsTable.id,
    url:              vendorWebhookEndpointsTable.url,
    rawSecretPreview: vendorWebhookEndpointsTable.rawSecretPreview,
    events:           vendorWebhookEndpointsTable.events,
    isActive:         vendorWebhookEndpointsTable.isActive,
    createdAt:        vendorWebhookEndpointsTable.createdAt,
  }).from(vendorWebhookEndpointsTable)
    .where(eq(vendorWebhookEndpointsTable.vendorId, vendor.id))
    .orderBy(vendorWebhookEndpointsTable.createdAt);

  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt?.toISOString() ?? null })));
});

router.post("/developer/webhooks", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req, res);
  if (!vendor) return;

  const existing = await db.select({ id: vendorWebhookEndpointsTable.id })
    .from(vendorWebhookEndpointsTable)
    .where(and(eq(vendorWebhookEndpointsTable.vendorId, vendor.id), eq(vendorWebhookEndpointsTable.isActive, true)));
  if (existing.length >= MAX_WEBHOOKS) {
    res.status(400).json({ error: `Maximum of ${MAX_WEBHOOKS} active webhooks allowed` });
    return;
  }

  const { url, events = ["*"] } = req.body as { url?: string; events?: string[] };
  if (!url?.startsWith("https://")) {
    res.status(400).json({ error: "url must be a valid HTTPS URL" });
    return;
  }
  const badEvents = (events as string[]).filter((e) => !SUPPORTED_EVENTS.includes(e));
  if (badEvents.length) {
    res.status(400).json({ error: `Unknown event types: ${badEvents.join(", ")}` });
    return;
  }

  // Generate HMAC signing secret
  const rawSecret = `whsec_${randomBytes(24).toString("hex")}`;
  const secretHash = sha256(rawSecret);
  const rawSecretPreview = rawSecret.slice(0, 14);

  const [row] = await db.insert(vendorWebhookEndpointsTable).values({
    vendorId: vendor.id,
    url,
    secretHash,
    rawSecretPreview,
    events: events as string[],
    isActive: true,
  }).returning();

  res.status(201).json({
    id:        row.id,
    url:       row.url,
    events:    row.events,
    isActive:  row.isActive,
    createdAt: row.createdAt?.toISOString(),
    rawSecret, // ⚠️ Shown ONCE — use to verify incoming webhook signatures
  });
});

router.patch("/developer/webhooks/:id", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req, res);
  if (!vendor) return;

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.select().from(vendorWebhookEndpointsTable)
    .where(and(eq(vendorWebhookEndpointsTable.id, id), eq(vendorWebhookEndpointsTable.vendorId, vendor.id)));
  if (!row) { res.status(404).json({ error: "Webhook not found" }); return; }

  const { isActive, events } = req.body as { isActive?: boolean; events?: string[] };
  const patch: Partial<typeof row> = {};
  if (typeof isActive === "boolean") patch.isActive = isActive;
  if (Array.isArray(events)) patch.events = events;
  if (!Object.keys(patch).length) { res.status(400).json({ error: "Nothing to update" }); return; }

  await db.update(vendorWebhookEndpointsTable).set(patch).where(eq(vendorWebhookEndpointsTable.id, id));
  res.json({ ok: true });
});

router.delete("/developer/webhooks/:id", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req, res);
  if (!vendor) return;

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.select().from(vendorWebhookEndpointsTable)
    .where(and(eq(vendorWebhookEndpointsTable.id, id), eq(vendorWebhookEndpointsTable.vendorId, vendor.id)));
  if (!row) { res.status(404).json({ error: "Webhook not found" }); return; }

  await db.delete(vendorWebhookEndpointsTable).where(eq(vendorWebhookEndpointsTable.id, id));
  res.json({ ok: true });
});

// Send a test payload to confirm the endpoint is reachable
router.post("/developer/webhooks/:id/test", async (req, res): Promise<void> => {
  const vendor = await resolveVendor(req, res);
  if (!vendor) return;

  const id = Number(req.params.id);
  const [row] = await db.select().from(vendorWebhookEndpointsTable)
    .where(and(eq(vendorWebhookEndpointsTable.id, id), eq(vendorWebhookEndpointsTable.vendorId, vendor.id)));
  if (!row) { res.status(404).json({ error: "Webhook not found" }); return; }

  const testPayload = JSON.stringify({
    event: "test",
    timestamp: new Date().toISOString(),
    vendorId: vendor.id,
    data: { message: "This is a test event from Awa Biz Suite" },
  });

  // HMAC-sign the payload
  const { createHmac } = await import("node:crypto");
  const signature = row.secretHash
    ? createHmac("sha256", row.secretHash).update(testPayload).digest("hex")
    : "";

  try {
    const response = await fetch(row.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Awa-Signature": `sha256=${signature}`,
        "X-Awa-Event": "test",
      },
      body: testPayload,
      signal: AbortSignal.timeout(8000),
    });
    res.json({ ok: true, statusCode: response.status, statusText: response.statusText });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err) });
  }
});

// GET /developer/scopes — list available scopes and supported webhook events
router.get("/developer/meta", async (_req, res): Promise<void> => {
  res.json({
    scopes: AVAILABLE_SCOPES.map((s) => ({
      id: s,
      description: SCOPE_DESCRIPTIONS[s] ?? s,
    })),
    webhookEvents: SUPPORTED_EVENTS,
    baseUrl: "/api/external",
    docsUrl: "/developers",
  });
});

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  read: "Read access to posts, leads, products, inventory, orders, and analytics",
  "write:posts": "Create, update, and delete social media posts",
  "write:leads": "Create, update, and delete leads",
  "write:products": "Create, update, and delete products",
  "write:orders": "Create and update orders",
  "write:inventory": "Manage inventory levels and transactions",
  "write:campaigns": "Manage email and SMS campaigns",
  analytics: "Access detailed analytics data",
};

export default router;
