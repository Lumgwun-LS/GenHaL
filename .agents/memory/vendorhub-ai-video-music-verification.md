---
name: VendorHub AI video background music verification
description: What real (non-synthetic) ElevenLabs sound-generation testing showed about music duration, looping, and fades for AI-generated post videos.
---

Verified with real ElevenLabs sound-generation calls (not the earlier synthetic sine-wave test) for 1, 2, and 3 scenes — the render route's actual supported range (`renderAiVideoBodySceneImageUrlsMax = 3`, ~13.8s max video length).

- ElevenLabs consistently returns audio *at or slightly longer than* the requested `duration_seconds` (e.g. ~6.03s for a 6s request), never shorter, across all three tested lengths.
- Because of this, and because the route's approx-duration formula always requests ≤ ~14s (well under ElevenLabs's ~22s sound-generation ceiling), the `-stream_loop -1` in `video-generation.ts`'s music-mixing ffmpeg call never actually needs to repeat the clip in production today — it's a safety net, not exercised.
- Forced a synthetic 6-scene (~27s) case past the 22s ceiling to actually exercise the loop path: sample-level analysis at the loop boundary found no digital click (delta in line with the track's own normal peaks) — just the expected musical "restart," acceptable for a background bed at the mixed-in volume (0.28) used.

**Why this matters:** if the scene cap is ever raised (see follow-up task "Match AI video background music to what the video is actually about"), the loop boundary should get a short crossfade rather than the current hard repeat, since a real loop only gets exercised past ~22s of total video length.
