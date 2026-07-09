/**
 * Public read endpoint for site content — no auth required.
 * Powers the landing page and any public-facing marketing copy.
 */
import { Router } from "express";
import { getSiteContent, PUBLIC_SITE_CONTENT_KEYS } from "../lib/site-content";

const router = Router();

router.get("/site-content", async (_req, res): Promise<void> => {
  const content = await getSiteContent();
  const publicContent: Record<string, unknown> = {};
  for (const key of PUBLIC_SITE_CONTENT_KEYS) publicContent[key] = content[key];
  res.json(publicContent);
});

export default router;
