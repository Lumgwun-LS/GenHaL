---
name: GenHaL Proof-of-Life system
description: Quarterly check-in reminder system for GenHaL family accounts; tracks missed checks and alerts Next of Kin after 4 consecutive misses.
---

## What it does
Every 90 days a unique 8-char token is emailed to the family account head. If they respond (click link or POST the code), `responded_at` is recorded. After 4 consecutive expired-without-response cycles (~1 year), the family's Next of Kin is emailed once.

## Table
`genhal_life_checks` — family_id, token (unique), sent_at, responded_at, expires_at, sequence (1–4), nok_notified_at, created_at. Migration 0128.

## Key files
- Scheduler: `artifacts/api-server/src/lib/genhal-life-check-scheduler.ts` — runs daily, uses LEFT JOIN to most-recent check per family
- Routes: `artifacts/api-server/src/routes/genhal-life-checks.ts` — public POST/GET verify + auth'd history + admin list
- Emails: appended to `artifacts/api-server/src/lib/genhal-emails.ts` — `sendLifeCheckReminderEmail` + `sendNextOfKinAlertEmail`
- Frontend: `artifacts/genhal-web/src/pages/verify.tsx` — auto-verifies on load if ?token= in URL, manual entry otherwise; at route `/verify`

## Rules
- Scheduler imports tables from `@workspace/db` (barrel), NOT from `@workspace/db/schema/*` sub-paths — those don't exist as sub-path exports.
- Token is NEVER returned via the list/history APIs — only a `tokenHint` (first 2 + last 2 chars masked).
- After NOK is notified, further reminders are paused (scheduler checks `nokNotifiedAt` on most-recent check).
- Sequence resets to 1 after any successful response.
- Next of Kin info lives on `genhalFamilyAccountsTable`: nextOfKinName, nextOfKinEmail, nextOfKinPhone, nextOfKinRelationship.
