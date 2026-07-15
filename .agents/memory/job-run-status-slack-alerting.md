---
name: Job-run-status Slack alerting
description: recordJobRun now fires Slack alerts on failing-threshold transitions, generalized to every background job that calls it.
---

recordJobRun (job-run-status.ts) fires a Slack alert exactly once when a job's
consecutiveFailures crosses JOB_FAILING_THRESHOLD (started failing), and once
when a previously-failing job succeeds again (recovered) — mirroring the
pass/fail transition dedupe already used in recheckPlatformCredentials
(platform-gateways.ts). Because this lives inside the shared recordJobRun
helper (keyed by jobName), every scheduler that already calls recordJobRun
(subscription-sync, social-account-health, gateway-health, etc.) gets Slack
alerting for free — no per-job wiring needed for new jobs.

**Why:** the admin Background Jobs panel only surfaces a failing banner if
someone opens it; a push alert is needed for unattended detection, and the
gateway-health job already proved out the correct transition-based dedupe
pattern (alert once per state change, not every tick).

**How to apply:** if you add a new background job with its own recordJobRun
calls, you get Slack alerting automatically — do not add a bespoke
becameFailing/recovered check per job.
