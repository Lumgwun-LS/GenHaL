---
name: Dev DB drift is widespread, not one-off
description: The dev database has been missing many applied-in-code migrations (columns/tables) across unrelated background jobs; checking one job's fix doesn't mean siblings are fine.
---

While fixing task #122 (billing sync jobs crashing on missing `platform_payment_credentials` columns), restarting the api-server workflow surfaced several *other* unrelated background jobs also crashing on missing schema, from migrations further down the numbered sequence:

- `pending-reminders.ts` — `vendors.announcement_email_opt_out` missing (migration 0033)
- `voice-backfill.ts` — `site_content_audit_log` table missing (migration 0031)
- `subscription-sync-scheduler.ts` — `job_run_status` table missing (migration 0025)
- `social-account-health-scheduler.ts` — same `job_run_status` dependency

**Why:** migrations 0020 through at least 0033+ were written into `lib/db/migrations/` but never actually applied to the dev database via `drizzle-kit push` (which has been blocked by interactive-prompt issues on unrelated pre-existing drift — see `drizzle-push-interactive-prompt.md`). Each session that hits one crash and patches only that one table leaves the rest still broken, so the same class of bug keeps resurfacing under different job names.

**How to apply:** when told "job X crashes with column/relation does not exist," don't just patch the one column/table named in the error. Restart the workflow and read the *entire* startup log — every background job's first tick usually fires within seconds and will surface every currently-missing schema dependency in one shot. Cross-check `ls lib/db/migrations/` for any migration files not yet reflected in `information_schema.columns`/`to_regclass` and apply all of them together via `executeSql`, not just the one relevant to the originally-reported error. Task #123 ("Catch schema drift before it silently breaks background jobs") is intended to solve this class of problem generally — don't try to permanently fix it ad hoc from an unrelated task.
