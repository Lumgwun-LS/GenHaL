/**
 * Per-platform media/caption limits used to give vendors accurate guidance
 * when composing a post (Social > Compose) instead of a one-size-fits-all
 * assumption. These are informational today (shown in the UI) — publishing
 * itself still relies on each platform's own API validation as the source
 * of truth, since limits change over time and vary by account type.
 */
export interface PlatformConstraints {
  label: string;
  captionMaxChars: number;
  image: { recommendedAspect: string; notes: string };
  video: { recommendedAspect: string; maxDurationSeconds: number; maxSizeMb: number; notes: string };
}

export const PLATFORM_CONSTRAINTS: Record<string, PlatformConstraints> = {
  facebook: {
    label: "Facebook",
    captionMaxChars: 63206,
    image: { recommendedAspect: "1:1 or 4:5", notes: "Square or portrait crops preview best in-feed." },
    video: { recommendedAspect: "1:1 or 4:5", maxDurationSeconds: 240 * 60, maxSizeMb: 10240, notes: "Feed videos over ~2 min get truncated in preview but still play on click." },
  },
  instagram: {
    label: "Instagram",
    captionMaxChars: 2200,
    image: { recommendedAspect: "1:1 or 4:5", notes: "Landscape (16:9) gets cropped in the grid view." },
    video: { recommendedAspect: "9:16", maxDurationSeconds: 90, maxSizeMb: 1024, notes: "Reels-style vertical video performs best; requires a publicly hosted URL to publish." },
  },
  linkedin: {
    label: "LinkedIn",
    captionMaxChars: 3000,
    image: { recommendedAspect: "1.91:1 (landscape)", notes: "Landscape images read best in the professional feed layout." },
    video: { recommendedAspect: "16:9 or 1:1", maxDurationSeconds: 600, maxSizeMb: 5120, notes: "Native video autoplays muted in-feed; keep the first 3s meaningful without sound." },
  },
  twitter: {
    label: "X (Twitter)",
    captionMaxChars: 280,
    image: { recommendedAspect: "16:9", notes: "Landscape crops cleanly in the timeline card." },
    video: { recommendedAspect: "16:9", maxDurationSeconds: 140, maxSizeMb: 512, notes: "Short, punchy clips outperform longer uploads in the timeline." },
  },
  tiktok: {
    label: "TikTok",
    captionMaxChars: 2200,
    image: { recommendedAspect: "9:16", notes: "TikTok is video-first; photo posts still render as a vertical slideshow." },
    video: { recommendedAspect: "9:16", maxDurationSeconds: 600, maxSizeMb: 4096, notes: "Full-bleed vertical video is required — landscape gets letterboxed." },
  },
};

export function getPlatformConstraints(platformKey: string): PlatformConstraints | undefined {
  return PLATFORM_CONSTRAINTS[platformKey];
}
