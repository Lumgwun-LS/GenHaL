---
name: Export-burst soft block/acknowledge pattern
description: How the vendor-export burst threshold blocks further exports and how the clear-flag ack is derived, for reuse on similar "pause until reviewed" features.
---

Once an admin's export count in the rolling window reaches the alert threshold, `GET /admin/vendors/export` returns 429 instead of streaming a CSV (`artifacts/api-server/src/routes/admin.ts`, `getExportBurstStatus`).

The unblock condition is derived, not a simple boolean flag: take the export that caused the count to *first* reach the threshold (the Nth-most-recent row within the window) as `flaggedAt`. The admin stays blocked unless a stored acknowledgment (`admin_export_acknowledgments`, one row per admin, upserted) has `acknowledgedAt >= flaggedAt`. This means an old ack from a *previous* burst does not auto-clear a *new* one — new exports past the ack naturally push `flaggedAt` forward and re-block.

**Why:** a plain "cleared: true/false" flag would either stay cleared forever after one review (letting a truly compromised account export indefinitely once ack'd) or require manually re-flagging — deriving it from timestamps handles both without extra state transitions.

**How to apply:** any other "pause until reviewed" feature (e.g. suspicious bulk-message sends, repeated failed payment retries) can reuse this shape: an events table with timestamps + a single upsertable "last reviewed at" row per actor, compared against the timestamp of the event that crossed the threshold.

**Full history alongside the fast-path row:** the block check only ever needs the *latest* review, but a compliance trail needs every past one. Keep the single upsertable row for the block check untouched, and also append every review to a separate append-only log table (mirrors the `site_content_audit_log` pattern) — insert into both on every acknowledge action, never replace the append-only one.
