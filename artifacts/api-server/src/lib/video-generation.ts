/**
 * Short "Ken Burns" style video generation for social posts.
 *
 * There is no supported AI text-to-video API available to the running server
 * today (OpenAI/Gemini AI Integrations explicitly do not support video
 * generation/output — see the media-generation skill). Instead we build a
 * short, genuinely relevant video from the AI-generated product image itself:
 * a smooth zoom/pan animation with the post's caption burned in as a text
 * overlay, encoded with ffmpeg (already available in this environment).
 *
 * This keeps the video tightly relevant to the post's product/caption
 * content (it's built directly from the same AI image + caption) and
 * produces a real, playable mp4 rather than a mocked asset.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const DURATION_SECONDS = 6;
const FPS = 25;
const MAX_OVERLAY_CHARS = 180;

/** Escapes text for safe use inside an ffmpeg drawtext filter argument. */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

/**
 * Renders a short zoom/pan video from a still image, with the caption text
 * burned in as a lower-third overlay for the first few seconds. Returns the
 * encoded mp4 as a Buffer.
 */
export async function generateVideoBuffer(imageBuffer: Buffer, captionText: string): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "ai-video-"));
  const inputPath = path.join(dir, "input.png");
  const outputPath = path.join(dir, `${randomUUID()}.mp4`);

  try {
    await writeFile(inputPath, imageBuffer);

    const overlayText = escapeDrawtext(captionText.trim().slice(0, MAX_OVERLAY_CHARS));
    const zoomFrames = DURATION_SECONDS * FPS;

    // Ken Burns zoom-in over the still frame, then burn the caption in as a
    // bottom-third overlay for the first 4.5s so it stays readable but
    // doesn't cover the whole clip.
    const filters = [
      `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase`,
      `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT}`,
      `zoompan=z='min(zoom+0.0012,1.15)':d=${zoomFrames}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=${FPS}`,
    ];
    if (overlayText) {
      filters.push(
        `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${overlayText}':fontcolor=white:fontsize=36:line_spacing=6:box=1:boxcolor=black@0.55:boxborderw=18:x=(w-text_w)/2:y=h-th-50:enable='between(t,0,4.5)'`,
      );
    }

    await runFfmpeg([
      "-y",
      "-loop", "1",
      "-i", inputPath,
      "-filter_complex", filters.join(","),
      "-t", String(DURATION_SECONDS),
      "-r", String(FPS),
      "-pix_fmt", "yuv420p",
      "-c:v", "libx264",
      "-profile:v", "main",
      "-movflags", "+faststart",
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
