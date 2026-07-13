---
name: Voice call-status backfill/reconciliation
description: How stuck voice call statuses (from a stale Twilio Auth Token) get self-healed
---

A background job (`voice-backfill.ts`, `startVoiceBackfillScheduler`, ticks every 5 min + once on
boot) finds `voice_call_logs` / `voice_campaign_calls` rows stuck in a non-terminal status
(`queued`/`ringing`/`in-progress`) for >15 minutes and re-fetches the real status straight from
Twilio's REST `Calls/{sid}.json` via the connector proxy (outbound, API-key authed) — this path is
unaffected by the inbound webhook signature failures that caused the stuck status in the first
place, so once an admin fixes `TWILIO_AUTH_TOKEN` the very next tick self-heals automatically with
no separate "resume" step needed.

**Why:** the signature-validated status-callback webhook (routes/voice-status-callback.ts) silently
403s every update while the token is stale, so terminal statuses never arrive; there's no other
inbound signal that a call finished.

**How to apply:** run status/outcome for any similarly "webhook-fed, can silently stop" state lives
in `site-content` under `admin.voiceBackfillLastRun` (ranAt/triggeredBy/checked/updated/failed) —
same pattern used for other admin job-state snapshots. Admin can also trigger it on demand via
`POST /admin/voice-backfill/run`.
