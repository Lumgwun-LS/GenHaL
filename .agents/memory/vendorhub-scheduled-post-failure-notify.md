---
name: Scheduled post auto-publish-failure notice
description: How the "post failed to auto-publish" vendor notice is wired, for anyone touching post-scheduler.ts or executeClaimedPublish again.
---

`posts.autoPublishFailed` (boolean) flags a post that the scheduled auto-publisher reverted to "approved" because every platform failed. It powers a distinct "Failed to auto-publish" badge in the Social Hub, separate from the normal status badge.

**Why:** Auto-publish failures were previously silent — the vendor only found out by noticing the post never went live. The flag plus an in-app + email notice (via `post-notifications.ts`, following the existing tier-downgrade/voice-campaign notification pattern) makes the failure visible without the vendor having to check.

**How to apply:**
- `executeClaimedPublish(claimed, { auto })` only sets `autoPublishFailed`/sends the notice when `auto: true` (the scheduled path) — a manual "Publish Now" failure is already surfaced immediately in the UI via the publish response, so it clears the flag instead.
- The flag is cleared on successful publish, on (re)scheduling, and on cancel-schedule — anywhere the vendor gets a fresh attempt.
- `post-scheduler.ts`'s catch block (a DB-level exception before `executeClaimedPublish` could resolve the claim) also sets the flag and sends a generic (no per-platform detail) notice — don't forget this second path when changing the notification shape.
