---
name: Admin sender attribution
description: Pattern for recording which admin performed an action so history stays readable later.
---

## Rule
When an admin-originated row needs to show "who did this" later (audit log entry, sent message, etc.), store both the Clerk `admin_user_id` and a resolved `admin_display_name` snapshot at write time — don't rely on looking the name up again later or on the id alone.

Resolution order: `firstName + lastName` → `username` → `primaryEmailAddress` → first `emailAddresses[0]`. Wrap the Clerk lookup in try/catch and fall back to `null` — a failed name lookup must never block the underlying action from completing.

## Why
The admin's Clerk profile (name, email) can change after the action was recorded. Snapshotting the display name at write time keeps historical records accurate. This pattern was first established for `admin_audit_log` (tier/verification changes) and reused for `vendor_notifications` (admin messages to vendors).

## How to apply
Any new admin-attributed table should add both `admin_user_id` (text, Clerk id) and `admin_display_name` (text, nullable) columns, and populate them the same way at insert time.
