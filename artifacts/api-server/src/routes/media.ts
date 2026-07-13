/**
 * Serves server-generated post media (AI images/videos) publicly, no auth.
 *
 * Required so external platforms can fetch it server-to-server — Instagram's
 * Content Publishing API in particular only accepts a publicly reachable
 * image URL (it has no direct byte-upload path, unlike Facebook's Page photo
 * endpoint). Mounted BEFORE requireAuth in routes/index.ts, same as the other
 * externally-fetched public routes (voice-tts-audio, voice-status-callback).
 *
 * The media itself is AI-generated marketing content the vendor intends to
 * publish to public social platforms anyway, so it's served unconditionally
 * (no ACL/ownership check) — same trust model as public-post-links.ts.
 */
import { Readable } from "node:stream";
import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.get("/media/:objectId", async (req: Request, res: Response) => {
  try {
    const objectFile = await objectStorageService.getObjectEntityFile(`/objects/uploads/${req.params.objectId}`);
    const response = await objectStorageService.downloadObject(objectFile, 31536000);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).end();
      return;
    }
    req.log.error({ err }, "[media] Error serving generated media");
    res.status(500).end();
  }
});

export default router;
