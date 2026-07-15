---
name: VendorHub X/LinkedIn video publishing
description: How chunked video upload was added for X (Twitter) and LinkedIn publishing, and what remains unbuilt.
---

Both platforms needed a multi-step upload before video could be attached to a post, distinct from the single-request image upload:

- **X/Twitter**: v1.1 `media/upload.json` INIT (declare size/category) → APPEND (sequential byte chunks) → FINALIZE → poll STATUS (`command=STATUS`) until `processing_info.state === "succeeded"` (async video processing) before attaching `media_id` to a v2 tweet.
- **LinkedIn**: Videos API `initializeUpload` (returns one `uploadUrl` per byte range sized to the file) → PUT each range and capture its `ETag` response header → `finalizeUpload` with the collected ETags as `uploadedPartIds` → reference the video URN in `content.media.id` on the Posts API call, same shape as the image path.

Neither flow validates size/duration/codec limits upfront — errors only surface as a raw provider rejection at publish time (tracked as a follow-up).

**Why:** documented here because the multi-step sequences (especially LinkedIn's per-part ETag collection and X's async STATUS poll) are easy to get subtly wrong in a refactor and aren't obvious from a quick read of either provider's docs.
