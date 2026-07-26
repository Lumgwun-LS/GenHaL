/**
 * Unified media library — returns the vendor's AI-generated images/videos
 * alongside their own uploaded images/videos in a single sorted list.
 *
 * Also hosts the server-side video processing endpoint (trim + caption
 * overlay) that the VideoEditorDialog invokes after the user sets in/out
 * points and an optional caption.
 */
import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { aiGenerationsTable, vendorUploadsTable, vendorsTable } from "@workspace/db/schema";
import { eq, and, isNull, or, desc } from "drizzle-orm";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

async function resolveAuthedVendor(req: import("express").Request) {
  const { userId } = getAuth(req);
  if (!userId) return null;
  const [vendor] = await db
    .select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(eq(vendorsTable.clerkUserId, userId))
    .limit(1);
  return vendor ?? null;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on("error", reject);
    proc.on("close", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-3000)}`));
    });
  });
}

// ── GET /media-library ────────────────────────────────────────────────────────
// Returns a merged, date-sorted list of AI-generated images/videos and vendor
// uploads (both not yet deleted by the cleanup job).
router.get("/media-library", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [aiMedia, uploads] = await Promise.all([
    db.select()
      .from(aiGenerationsTable)
      .where(and(
        eq(aiGenerationsTable.vendorId, vendor.id),
        isNull(aiGenerationsTable.mediaDeletedAt),
        or(
          eq(aiGenerationsTable.type, "image"),
          eq(aiGenerationsTable.type, "video"),
        ),
      ))
      .orderBy(desc(aiGenerationsTable.createdAt)),
    db.select()
      .from(vendorUploadsTable)
      .where(and(
        eq(vendorUploadsTable.vendorId, vendor.id),
        isNull(vendorUploadsTable.mediaDeletedAt),
      ))
      .orderBy(desc(vendorUploadsTable.createdAt)),
  ]);

  const items = [
    ...aiMedia
      .filter((g) => g.result) // only completed generations with a URL
      .map((g) => ({
        id: `ai-${g.id}`,
        source: "ai" as const,
        type: g.type as "image" | "video",
        url: g.result!,
        prompt: g.prompt,
        expiringSoon: !!g.mediaWarningSentAt,
        createdAt: g.createdAt.toISOString(),
      })),
    ...uploads.map((u) => ({
      id: `upload-${u.id}`,
      source: "upload" as const,
      type: u.mediaType as "image" | "video",
      url: u.mediaUrl,
      prompt: null as string | null,
      expiringSoon: !!u.mediaWarningSentAt,
      createdAt: u.createdAt.toISOString(),
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json(items);
});

// ── POST /media/process-video ─────────────────────────────────────────────────
// Server-side ffmpeg processing: trim and/or burn-in a text caption.
// Saves the result as a new vendorUpload so it appears in the media library.
router.post("/media/process-video", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { sourceUrl, trim, caption } = req.body as {
    sourceUrl: string;
    trim?: { startSeconds: number; durationSeconds: number };
    caption?: { text: string; position: "top" | "center" | "bottom"; fontSize?: number };
  };

  if (!sourceUrl || typeof sourceUrl !== "string") {
    res.status(400).json({ error: "sourceUrl is required" }); return;
  }
  if (!trim && !caption) {
    res.status(400).json({ error: "At least one of trim or caption is required" }); return;
  }

  // Download the source video
  let videoBuffer: Buffer;
  try {
    const r = await fetch(sourceUrl);
    if (!r.ok) throw new Error(`status ${r.status}`);
    videoBuffer = Buffer.from(await r.arrayBuffer());
  } catch (err) {
    res.status(400).json({ error: `Could not fetch source video: ${(err as Error).message}` }); return;
  }

  const tmpDir = await mkdtemp(path.join(tmpdir(), "media-edit-"));
  try {
    const inputPath = path.join(tmpDir, "input.mp4");
    const outputPath = path.join(tmpDir, "output.mp4");
    await writeFile(inputPath, videoBuffer);

    // Build ffmpeg args
    const args: string[] = ["-y"];

    // Trim: use -ss/-t *before* -i for fast seek on input side
    if (trim) {
      args.push("-ss", String(Math.max(0, trim.startSeconds)));
      args.push("-t", String(Math.max(1, trim.durationSeconds)));
    }

    args.push("-i", inputPath);

    // Caption overlay using drawtext filter
    if (caption?.text) {
      const safe = caption.text
        .replace(/\\/g, "\\\\\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\u2019")
        .replace(/%/g, "\\%")
        .replace(/\r?\n/g, " ");
      const fs = caption.fontSize ?? 36;
      const yPos =
        caption.position === "top"
          ? "50"
          : caption.position === "center"
          ? "(h-text_h)/2"
          : "h-th-50";
      const filter =
        `drawtext=text='${safe}':fontsize=${fs}:fontcolor=white:` +
        `x=(w-text_w)/2:y=${yPos}:` +
        `box=1:boxcolor=black@0.55:boxborderw=12`;
      args.push("-vf", filter);
    }

    args.push("-c:v", "libx264", "-crf", "22", "-preset", "fast");
    args.push("-c:a", "aac", "-movflags", "+faststart");
    args.push(outputPath);

    await runFfmpeg(args);
    const outputBuffer = await readFile(outputPath);

    // Upload to object storage
    const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadUrl);
    const objectId = objectPath.replace(/^\/objects\/uploads\//, "");

    await fetch(uploadUrl, {
      method: "PUT",
      body: outputBuffer,
      headers: { "Content-Type": "video/mp4" },
    });

    const base = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN;
    if (!base) { res.status(500).json({ error: "No public domain configured" }); return; }
    const videoUrl = `https://${base}/api/media/${objectId}`;

    // Mark as public and record in vendor_uploads
    await objectStorageService
      .trySetObjectEntityAclPolicy(objectPath, { owner: "system:vendor-upload", visibility: "public" })
      .catch(() => {/* best-effort */});

    await db.insert(vendorUploadsTable).values({ vendorId: vendor.id, mediaUrl: videoUrl, mediaType: "video" });

    res.json({ videoUrl });
  } catch (err) {
    req.log?.error({ err }, "[media-library] process-video failed");
    res.status(500).json({ error: `Video processing failed: ${(err as Error).message}` });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

// ── POST /media/upload-url ────────────────────────────────────────────────────
// Auth-based presigned upload URL — derives vendorId from the session so
// callers (MediaPickerDialog, AI Studio) don't need to pass it explicitly.
router.post("/media/upload-url", async (req, res): Promise<void> => {
  const vendor = await resolveAuthedVendor(req);
  if (!vendor) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { mediaType } = req.body as { mediaType?: "image" | "video" };
  if (mediaType !== "image" && mediaType !== "video") {
    res.status(400).json({ error: "mediaType must be 'image' or 'video'" }); return;
  }

  const base = process.env.PUBLIC_APP_DOMAIN || process.env.REPLIT_DEV_DOMAIN;
  if (!base) { res.status(500).json({ error: "No public domain configured" }); return; }

  const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
  const objectPath = objectStorageService.normalizeObjectEntityPath(uploadUrl);
  const objectId = objectPath.replace(/^\/objects\/uploads\//, "");
  const mediaUrl = `https://${base}/api/media/${objectId}`;

  await objectStorageService
    .trySetObjectEntityAclPolicy(objectPath, { owner: "system:vendor-upload", visibility: "public" })
    .catch(() => {/* best-effort */});

  await db.insert(vendorUploadsTable).values({ vendorId: vendor.id, mediaUrl, mediaType });

  res.json({ uploadUrl, mediaUrl });
});

export default router;
