/**
 * Extracts a handful of evenly-spaced JPEG still frames from an uploaded
 * video, for cases where the source video is too large to send to Gemini
 * inline (see analyzeVideoForCaption in routes/ai.ts). Reuses the same
 * spawn-ffmpeg pattern as video-generation.ts.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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

function runFfprobe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`ffprobe exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

/**
 * Extracts `count` evenly-spaced JPEG frames from the video buffer and
 * returns them as JPEG byte buffers, in chronological order. Falls back to
 * a single frame at the 1s mark if duration probing fails.
 */
export async function extractVideoFrames(videoBuffer: Buffer, count = 6): Promise<Buffer[]> {
  const dir = await mkdtemp(path.join(tmpdir(), "vh-frames-"));
  const inputPath = path.join(dir, `${randomUUID()}.mp4`);
  try {
    await writeFile(inputPath, videoBuffer);

    let durationSec = 0;
    try {
      const out = await runFfprobe([
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        inputPath,
      ]);
      durationSec = parseFloat(out) || 0;
    } catch {
      durationSec = 0;
    }

    const timestamps = durationSec > 0
      ? Array.from({ length: count }, (_, i) => (durationSec * (i + 0.5)) / count)
      : [1];

    const frames: Buffer[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const framePath = path.join(dir, `frame-${i}.jpg`);
      await runFfmpeg([
        "-y",
        "-ss", timestamps[i].toFixed(2),
        "-i", inputPath,
        "-frames:v", "1",
        "-q:v", "3",
        "-vf", "scale=768:-2",
        framePath,
      ]);
      frames.push(await readFile(framePath));
    }
    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
