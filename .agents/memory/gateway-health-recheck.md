---
name: Platform gateway credential health recheck
description: How VendorHub detects a saved payment gateway key that later gets revoked/expired instead of only testing it at save time
---

Gateway credentials (`platform_payment_credentials` table) were only ever tested
once, at save time (`savePlatformCredentials`), leaving `testPassed: true` stale
forever if the key was later revoked/expired on the provider's side.

Fix: `recheckPlatformCredentials`/`recheckAllPlatformCredentials` in
`platform-gateways.ts` re-run the same per-provider `def.test()` used at save
time, track `lastCheckedAt` / `lastFailureReason` / `failingSince` columns, and
fire a Slack alert only on the pass→fail and fail→pass transitions (not every
tick). A 15-minute `setInterval` scheduler (`gateway-health-scheduler.ts`,
following the standard scheduled-job pattern) drives this automatically; an
admin "re-test all now" button hits the same function on demand.

**Why:** distinguishing "never verified" from "was working, now failing" needs
a `failingSince` marker — `testPassed` alone can't tell them apart, and without
transition-only alerting a 15-minute poll would spam Slack every cycle a key
stays broken.

**How to apply:** any other admin-configured, periodically-testable credential
(webhooks, third-party API keys) can reuse this same recheck+scheduler+banner
shape instead of only validating at save time.
