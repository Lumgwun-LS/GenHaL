---
name: Voice backfill recent-fixes tracking
description: How the call-status backfill job records which specific calls it reconciled, for admin visibility beyond aggregate counts.
---

`runVoiceBackfill` (artifacts/api-server/src/lib/voice-backfill.ts) records a
capped, newest-first list of individual reconciliations (callSid,
fromStatus, toStatus, ranAt) in the `admin.voiceBackfillRecentFixes`
site-content block, alongside the existing aggregate-only
`admin.voiceBackfillLastRun` block. `findStuckCallSids` returns a
`Map<callSid, beforeStatus>` (not just a list) so the "before" status is
available when a fix is recorded.

**Why:** the existing last-run block only had checked/updated/failed counts;
admins investigating a specific vendor/campaign incident need to see exactly
which calls were touched, not just how many.

**How to apply:** any future job that needs both a summary and a detail trail
can follow this same pattern — one site-content block for aggregate stats,
one capped array block for the recent-items detail, both written from the
same job run.
