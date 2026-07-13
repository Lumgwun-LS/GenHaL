---
name: Job run status pattern
description: Shared table/helper for admin visibility into unattended periodic background jobs (last run, what it found, stuck-failing banner).
---

Generalized `job_run_status` table (jobName-keyed) + `lib/job-run-status.ts`
(`recordJobRun`/`getJobRunStatus`) records the outcome of every tick for any
scheduled job — lastRunAt, lastSuccessAt, counts, lastError,
consecutiveFailures, isFailing (threshold-based).

**Why:** Mirrors the platform-gateway-health "last checked / currently
failing" bookkeeping so every future silent scheduler (birthday job, voice
campaign, export reconciliation, etc.) gets the same admin-visible health
story without inventing a bespoke table each time.

**How to apply:** In the job's tick function, wrap the whole body in
try/catch; call `recordJobRun(name, { success: true, checkedCount,
affectedCount })` on the success path (including "nothing to do" early
returns) and `recordJobRun(name, { success: false, error })` in the catch,
then rethrow. Expose via an admin route + a panel tab styled like
`artifacts/vendor-hub/src/pages/admin/payment-gateways.tsx`
(banner when `isFailing`).
