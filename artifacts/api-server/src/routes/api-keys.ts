/**
 * Admin routes for managing external API keys.
 * All routes require a valid Clerk session (requireAuth is applied upstream).
 *
 * POST   /api-keys            — create a new key (returns raw key ONCE)
 * GET    /api-keys            — list all keys (hashes, no raw values)
 * DELETE /api-keys/:id        — revoke a key
 */
import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import { db } from "@workspace/db";
import { externalApiKeysTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.post("/api-keys", async (req, res) => {
  const { name, source = "awajimaa" } = req.body as { name?: string; source?: string };
  if (!name) return res.status(400).json({ error: "name is required" });

  const rawKey = randomBytes(32).toString("hex");
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const [key] = await db
    .insert(externalApiKeysTable)
    .values({ name, keyHash, source, isActive: true })
    .returning();

  // Return the raw key ONCE — never stored in plaintext
  return res.status(201).json({
    id: key.id,
    name: key.name,
    source: key.source,
    createdAt: key.createdAt,
    rawKey, // ⚠️ Save this immediately — it cannot be retrieved again
  });
});

router.get("/api-keys", async (_req, res) => {
  const keys = await db
    .select({
      id: externalApiKeysTable.id,
      name: externalApiKeysTable.name,
      source: externalApiKeysTable.source,
      isActive: externalApiKeysTable.isActive,
      createdAt: externalApiKeysTable.createdAt,
      revokedAt: externalApiKeysTable.revokedAt,
    })
    .from(externalApiKeysTable)
    .orderBy(externalApiKeysTable.createdAt);
  res.json(keys);
});

router.delete("/api-keys/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  await db
    .update(externalApiKeysTable)
    .set({ isActive: false, revokedAt: new Date() })
    .where(eq(externalApiKeysTable.id, id));

  return res.status(200).json({ ok: true });
});

export default router;
