---
name: Scheduled job pattern
description: How recurring background jobs are implemented in the api-server (birthday scheduler, voice-campaign auto-launch scheduler).
---

Recurring background jobs in this codebase are plain `setInterval` loops started
in `index.ts` after `app.listen` — there is no cron library dependency.

Pattern:
- `setInterval(() => { tick().catch(() => {}); }, 5 * 60 * 1000)` ticks every 5 minutes.
- Also invoke `tick()` once immediately on boot, in case something was already due
  while the server was down.
- Idempotency/concurrency-safety comes from an atomic conditional UPDATE, not from
  in-memory locks: `UPDATE ... SET status = 'running' WHERE status = 'scheduled' AND id = X`.
  If a competing tick or a manual action already changed the status, the UPDATE
  matches zero rows and the job silently skips that item — no double-launch.
- User edits/cancellations take effect for free: they just move the row out of the
  status the scheduler's WHERE clause is looking for.

**Why:** matches the existing birthday-scheduler.ts precedent; keeps deployment
simple (no extra process/queue), and the atomic UPDATE is the same trick the
manual launch route already uses to prevent double-launch from concurrent requests.

**How to apply:** for any new "check every N minutes and act on due rows" feature,
add a new small file in `artifacts/api-server/src/lib/`, export a `startXScheduler()`,
and call it in `index.ts`'s `app.listen` callback alongside the others.
