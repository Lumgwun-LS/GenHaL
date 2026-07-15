---
name: Social health check vs. token-refresh notify
description: Why the periodic social-account health job must not call token-refresh.ts's ensureFreshAccessToken directly.
---

VendorHub has two separate places that can renew an OAuth-connected social
token: `token-refresh.ts` (`ensureFreshAccessToken`, used at publish time)
and the periodic health-check job (`social-account-health.ts`).

`ensureFreshAccessToken`'s failure path (`markNeedsReconnect`) sends a Slack
alert + vendor email on *every* failed renewal attempt, with no
transition guard. That's fine when it's only invoked once per publish
attempt, but the health job runs on a fixed interval (hourly) regardless of
publish activity.

**Why:** calling `ensureFreshAccessToken` from the periodic health job would
re-notify the vendor and re-alert admins on every single tick for as long as
a connection stays broken, defeating the whole "act on the transition, not
every tick" design used by every other health-check job in this codebase
(gateway-health, Meta account health, etc.).

**How to apply:** any new periodic health/validation job for an OAuth
token must do its own pass/fail transition tracking and its own renewal
attempt (calling the provider's raw `refreshXAccessToken` function and
persisting the result itself), not reuse a publish-time helper that notifies
unconditionally on failure.
