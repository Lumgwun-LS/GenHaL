/**
 * Public analytics routes — no auth required.
 * POST /analytics/pageview — lightweight visitor beacon, fire-and-forget.
 */
import { Router } from "express";
import { db, pageViewsTable } from "@workspace/db";

const router = Router();

router.post("/analytics/pageview", async (req, res): Promise<void> => {
  const { platform, path, referrer, sessionId } = req.body ?? {};
  if (!platform || !path) { res.status(400).json({ error: "platform and path are required" }); return; }
  const userAgent = req.headers["user-agent"] ?? null;
  try {
    await db.insert(pageViewsTable).values({
      platform: String(platform).slice(0, 32),
      path: String(path).slice(0, 512),
      referrer: referrer ? String(referrer).slice(0, 512) : null,
      sessionId: sessionId ? String(sessionId).slice(0, 64) : null,
      userAgent: userAgent ? String(userAgent).slice(0, 512) : null,
    });
  } catch { /* swallow */ }
  res.status(204).end();
});

export default router;
