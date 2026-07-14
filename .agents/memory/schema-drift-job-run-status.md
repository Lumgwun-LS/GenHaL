---
name: Schema-drift guard and background-job health tracking
description: How startup schema-drift detection and per-tick job health recording work together to make silent background-job failures admin-visible.
---

VendorHub has two complementary pieces for catching "migration written but never applied" drift:

1. `runSchemaDriftGuard` (schema-guard.ts) runs once at server boot, checks a curated list of
   columns/tables that background jobs depend on against `information_schema`, and logs +
   Slack-alerts loudly if anything is missing. It never crashes the process. The list is
   hand-maintained — every new migration a scheduler depends on needs an entry added, or drift on
   that specific column goes back to being invisible (tracked as a follow-up to auto-derive from
   the Drizzle schema instead).

2. Every periodic scheduler (pending-reminders, gateway-health, post-scheduler, voice-backfill,
   voice-campaign-scheduler, birthday calls/notifications, subscription-sync, social-account-health)
   calls `recordJobRun(jobName, { success, error, checkedCount?, affectedCount? })` from
   `job-run-status.ts` at the end of every tick, success or failure — including the very first tick
   on boot. `getAllJobRunStatuses()` aggregates all of them for a generic admin
   `GET /admin/job-run-status` endpoint and a "Background Jobs" admin panel tab, so a job stuck
   failing (3+ consecutive failures) is visible even if nobody built it a bespoke page.

**Why:** before this, a scheduler's top-level try/catch just logged and kept ticking forever with
no admin-visible signal — that's how a migration-drift crash went unnoticed until a vendor
reported reminders had silently stopped.

**How to apply:** when adding a new periodic background job, follow the same pattern — export a
`JOB_NAME` constant and call `recordJobRun` on every tick outcome — so it shows up in the generic
Background Jobs panel automatically. When adding a migration a scheduler depends on, add the
column/table to `EXPECTED_COLUMNS`/`EXPECTED_TABLES` in schema-guard.ts too.
