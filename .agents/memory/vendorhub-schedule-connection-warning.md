---
name: Schedule-time connection warning pattern
description: How VendorHub warns/blocks scheduling a post for a platform with no usable connected account.
---

Scheduling a post (`POST /posts/:id/schedule`) reuses the exact same per-platform resolution logic as actual publish time (`resolveTargetAccount` against active `social_accounts`) to detect, ahead of time, that a selected platform has no usable connection (missing account, no access token, or ambiguous multiple-accounts-for-one-platform).

**Why:** without this, a vendor schedules a post, the auto-publisher picks it up hours later, and fails for a reason that was knowable at schedule time — task 137 traced a real support-cost path back to this gap.

**How to apply:** the pattern is block-by-default with an explicit override, not silent warn-only —
- The schedule endpoint returns `409 { error, warnings }` when any platform has no usable connection; the caller can pass `force: true` in the body to schedule anyway (e.g. vendor plans to reconnect before the scheduled time).
- A separate `GET /posts/:id/connection-warnings` lets the UI show the same warning live, before the vendor even clicks confirm, without needing a failed submit first.
- Reuse this same pair (block+force / live-check endpoint) for any other "point in time state might go stale before it fires" scheduling decision, not just social posts.
