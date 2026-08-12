import { Router } from "express";
import { getSiteContentBlock } from "../lib/site-content";

const router = Router();

// GET /genhal/public/video-url — no auth; returns the configured R2 explainer video URL
router.get("/genhal/public/video-url", async (_req, res): Promise<void> => {
  try {
    const url = await getSiteContentBlock("genhal.explainerVideoUrl");
    res.json({ url: url || null });
  } catch (err) {
    res.json({ url: null });
  }
});

export default router;
