/**
 * Short AI-generated video production for social posts.
 *
 * There is no supported AI text-to-video API available to the running server
 * today (OpenAI/Gemini AI Integrations explicitly do not support video
 * generation/output — see the media-generation skill). Instead we build a
 * short, genuinely relevant video from AI-generated product image(s):
 * one or more "scenes" (each a still image brought to life with a motion
 * template — zoom/pan) stitched together with crossfade transitions, the
 * post's caption burned in as a text overlay on the first scene, and an
 * optional short instrumental background track mixed in.
 *
 * This keeps the video tightly relevant to the post's product/caption
 * content (it's built directly from the same AI image(s) + caption) and
 * produces a real, playable mp4 rather than a mocked asset.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const FPS = 25;
const MAX_OVERLAY_CHARS = 180;
// Crossfade length between consecutive scenes. Kept short so a 2-3 scene
// video doesn't lose too much runtime to transitions.
const XFADE_DURATION_SECONDS = 0.6;

export const MOTION_TEMPLATES = ["zoom-in", "zoom-out", "pan-left", "pan-right", "zoom-pan"] as const;
export type MotionTemplate = (typeof MOTION_TEMPLATES)[number];

export interface VideoScene {
  /** PNG/JPEG bytes for this scene's still frame. */
  imageBuffer: Buffer;
  /** Optional caption text burned in as a lower-third overlay for this scene. */
  overlayText?: string;
}

export interface GenerateVideoOptions {
  /** Motion applied to each scene. "auto" (default) cycles through templates across scenes. */
  motionTemplate?: MotionTemplate | "auto";
  /** Raw bytes (mp3/wav) of a short instrumental track to mix in under the video, if any. */
  musicBuffer?: Buffer;
}

/** Escapes text for safe use inside an ffmpeg drawtext filter argument. */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

/** Escapes commas for safe use inside an ffmpeg filter's own sub-expression (e.g. zoompan's `z=`). */
function escapeFilterCommas(expr: string): string {
  return expr.replace(/,/g, "\\,");
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

/** Builds the zoompan `z=`/`x=`/`y=` expressions for a given motion template and scene length. */
function buildZoompanExpr(template: MotionTemplate, frames: number): string {
  const centeredX = "iw/2-(iw/zoom/2)";
  const centeredY = "ih/2-(ih/zoom/2)";
  switch (template) {
    case "zoom-in":
      return `z='min(zoom+0.0012,1.15)':x='${centeredX}':y='${centeredY}'`;
    case "zoom-out":
      // Documented zoompan zoom-out pattern: start at max zoom, ease back
      // toward 1.0 using the filter's own running `zoom` state.
      return `z=${escapeFilterCommas("'if(eq(on,0),1.15,max(1.001,zoom-0.0012))'")}:x='${centeredX}':y='${centeredY}'`;
    case "pan-left":
      return `z=1.15:x='(iw-iw/zoom)*(on/${frames})':y='${centeredY}'`;
    case "pan-right":
      return `z=1.15:x='(iw-iw/zoom)*(1-on/${frames})':y='${centeredY}'`;
    case "zoom-pan":
      return `z='min(zoom+0.0012,1.15)':x='(iw-iw/zoom)*(on/${frames})':y='${centeredY}'`;
  }
}

function resolveTemplateForScene(index: number, requested: MotionTemplate | "auto" | undefined): MotionTemplate {
  if (requested && requested !== "auto") return requested;
  return MOTION_TEMPLATES[index % MOTION_TEMPLATES.length];
}

/**
 * Renders a short video from one or more still images. Each scene gets its
 * own motion (zoom/pan) template; multiple scenes are joined with crossfade
 * transitions. An optional caption overlay burns in as a lower-third for the
 * first ~4s of the scene it's attached to, and an optional background track
 * is mixed under the final video (looped and faded to match its length).
 * Returns the encoded mp4 as a Buffer.
 */
export async function generateVideoBuffer(scenes: VideoScene[], options: GenerateVideoOptions = {}): Promise<Buffer> {
  if (scenes.length === 0) throw new Error("generateVideoBuffer requires at least one scene");

  const dir = await mkdtemp(path.join(tmpdir(), "ai-video-"));
  // Single scenes get a slightly longer runtime since there's no transition
  // eating into it; multi-scene videos use a shorter per-scene length so the
  // total stays a reasonable ~10-15s.
  const sceneDurationSeconds = scenes.length === 1 ? 6 : 5;
  const zoomFrames = sceneDurationSeconds * FPS;

  try {
    const scenePaths: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const scenePath = path.join(dir, `scene-${i}.png`);
      await writeFile(scenePath, scenes[i].imageBuffer);
      scenePaths.push(scenePath);
    }

    const filterChains: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const template = resolveTemplateForScene(i, options.motionTemplate);
      const parts = [
        `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase`,
        `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT}`,
        `zoompan=${buildZoompanExpr(template, zoomFrames)}:d=${zoomFrames}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=${FPS}`,
      ];
      const overlayText = escapeDrawtext((scenes[i].overlayText ?? "").trim().slice(0, MAX_OVERLAY_CHARS));
      if (overlayText) {
        parts.push(
          `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${overlayText}':fontcolor=white:fontsize=36:line_spacing=6:box=1:boxcolor=black@0.55:boxborderw=18:x=(w-text_w)/2:y=h-th-50:enable='between(t,0,4)'`,
        );
      }
      parts.push("format=yuv420p");
      filterChains.push(`[${i}:v]${parts.join(",")}[v${i}]`);
    }

    let finalLabel = "v0";
    let cumulativeLength = sceneDurationSeconds;
    if (scenes.length > 1) {
      let prevLabel = "v0";
      for (let i = 1; i < scenes.length; i++) {
        const offset = cumulativeLength - XFADE_DURATION_SECONDS;
        const outLabel = i === scenes.length - 1 ? "vout" : `v0${i}`;
        filterChains.push(
          `[${prevLabel}][v${i}]xfade=transition=fade:duration=${XFADE_DURATION_SECONDS}:offset=${offset.toFixed(2)}[${outLabel}]`,
        );
        cumulativeLength = cumulativeLength + sceneDurationSeconds - XFADE_DURATION_SECONDS;
        prevLabel = outLabel;
      }
      finalLabel = "vout";
    }
    const totalDurationSeconds = cumulativeLength;

    const silentVideoPath = path.join(dir, "silent.mp4");
    // Each input loops the still image indefinitely (no input-level -t):
    // zoompan's `d` parameter only paces how the zoom expression evolves per
    // input frame, it does NOT cap total output length — with an infinite
    // looped input, zoompan will keep consuming "next" (identical) input
    // frames and emitting `d` output frames for each one forever. The only
    // thing that actually bounds the encode is an output-level -t, hence it
    // being set here to the exact total duration computed above.
    const inputArgs = scenePaths.flatMap((p) => ["-loop", "1", "-i", p]);
    await runFfmpeg([
      "-y",
      ...inputArgs,
      "-filter_complex", `${filterChains.join(";")}`,
      "-map", `[${finalLabel}]`,
      "-t", totalDurationSeconds.toFixed(2),
      "-r", String(FPS),
      "-pix_fmt", "yuv420p",
      "-c:v", "libx264",
      "-profile:v", "main",
      "-movflags", "+faststart",
      silentVideoPath,
    ]);

    if (!options.musicBuffer) {
      return await readFile(silentVideoPath);
    }

    // Mix in the background track: loop it to cover the full video length,
    // trim to the video's exact duration, fade in/out, and keep it well
    // under the (currently silent) voice/caption content so it reads as a
    // bed, not a competing sound.
    //
    // Verified with real (non-synthetic) ElevenLabs sound-generation calls
    // for 1-3 scenes (see task #143): requested duration always matches the
    // route's approxDurationSeconds formula exactly, and ElevenLabs
    // consistently returns audio slightly *longer* than requested (e.g.
    // ~6.03s for a 6s request), never shorter. Combined with the render
    // route's current 3-scene cap (max ~13.8s), the generated clip always
    // already covers the full video, so -stream_loop never actually needs
    // to repeat the track in production today — it's kept as a safety net
    // for if the scene cap is ever raised past ~22s (ElevenLabs's ceiling).
    // Manually inspecting a forced-loop case (6 synthetic scenes, ~27s) found
    // no digital click at the seam (sample deltas in line with the track's
    // own normal peaks), just the expected musical "restart" of the loop —
    // acceptable for a background bed at this volume, but if the cap is ever
    // raised, a short crossfade at the loop boundary (rather than this hard
    // -stream_loop repeat) would make longer loops sound smoother.
    const musicPath = path.join(dir, "music.mp3");
    await writeFile(musicPath, options.musicBuffer);
    const finalVideoPath = path.join(dir, "final.mp4");
    const fadeOutStart = Math.max(totalDurationSeconds - 1.5, 0);
    try {
      await runFfmpeg([
        "-y",
        "-i", silentVideoPath,
        "-stream_loop", "-1",
        "-i", musicPath,
        "-filter_complex",
        `[1:a]atrim=0:${totalDurationSeconds.toFixed(2)},afade=t=in:st=0:d=1,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=1.5,volume=0.28[aout]`,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        finalVideoPath,
      ]);
      return await readFile(finalVideoPath);
    } catch {
      // Music mixing is a nice-to-have; if it fails for any reason (bad
      // encode, unexpected ffmpeg build quirk), fall back to the silent
      // video rather than failing the whole generation.
      return await readFile(silentVideoPath);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
