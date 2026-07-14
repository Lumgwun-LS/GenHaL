---
name: VendorHub multi-scene AI video (motion templates + music)
description: How multi-scene/motion-template/background-music AI video generation was built without a real text-to-video model, and the ffmpeg zoompan gotcha that cost the most debugging time.
---

## Approach
- No text-to-video model is available server-side. Multi-scene videos are built by generating up to 3 distinct AI still images (via a cheap GPT chat call producing scene prompts, `buildScenePrompts` in `ai.ts`) and stitching them with ffmpeg `xfade` crossfades. Falls back to reusing one image for all scenes if the prompt-split call fails.
- 5 named `zoompan` motion presets + an `"auto"` mode that cycles them per scene (`MOTION_TEMPLATES` in `video-generation.ts`).
- Background music: no music-gen API exists in AI Integrations; reused the **ElevenLabs** connector's `/v1/sound-generation` endpoint (same connector already used for voice-call TTS) to make a short instrumental bed, clamped to ElevenLabs' ~22s ceiling. Optional; failure is caught and logged, never blocks the video. Mixed in as a second ffmpeg pass over the finished silent video (loop, trim to exact duration, fade in/out, lower volume, mux with `-shortest`); falls back to the silent video if this pass fails.

## The zoompan/xfade gotcha (cost the most time)
`zoompan`'s `d` parameter does **not** bound total output length. It only paces how the zoom expression evolves per *input* frame. With an infinitely looped single-image input (`-loop 1 -i img.png`, no input-level `-t`), zoompan will keep consuming "next" (identical, looped) input frames forever and emit `d` output frames for *each one* — producing an encode that runs for however long ffmpeg is allowed to keep reading (in one real test, 128,401 frames instead of the intended 50). The only thing that actually bounds duration is an **output-level `-t`** set to the exact total scene/xfade duration you computed. Putting `-t` on the *input* instead is also wrong — it feeds multiple real (repeated) input frames into zoompan, which then multiplies `d` output frames per input frame, again producing a huge runaway duration.

**Rule:** for any zoompan-based looped-image-to-video ffmpeg pipeline, always compute total duration yourself and pass it as `-t <duration>` on the final output — never rely on zoompan's `d` or the input loop to self-terminate.

## Verification approach that worked
Ad-hoc background shell processes (`nohup ... &`, `setsid`, `disown`) were unreliable for polling long ffmpeg renders across multiple ShellExec tool calls in this sandbox — processes and log files randomly vanished between calls (and `/tmp` itself was wiped once mid-session). What worked: call `generateVideoBuffer` directly from a throwaway `tsx` script placed inside the target package (not `/tmp`), run it **synchronously in one ShellExec call** with a generous `timeout_ms`, and use tiny lavfi-generated solid-color PNGs as fake "AI images" plus an ffmpeg sine-wave tone as fake "music" — real encodes only take 1-3 seconds once the duration bug above is fixed.
