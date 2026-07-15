---
name: VendorHub scheduled-post pre-publish reminder
description: How the "remind vendor before a scheduled post goes live" job is idempotent and wired into the existing push/email/notification stack.
---

Post reminders (task #140) reuse the exact idempotency shape already used for `autoPublishFailed`: a nullable `reminderSentAt` timestamp column directly on `postsTable`, claimed atomically via `UPDATE ... WHERE status='scheduled' AND reminder_sent_at IS NULL ... RETURNING`. This was chosen over a separate log table (like `pending-reminders.ts` uses) because the column lives right next to the data it gates and needs no join.

**Reset rule:** anything that changes `scheduledAt` on a still-scheduled post (the `/posts/:id/schedule` route, and the generic PATCH route when `scheduledAt` is in the payload) must also set `reminderSentAt: null`, or a reschedule silently loses its reminder.

**Why:** without the reset, claiming happens once per post row regardless of the new time, so a vendor who reschedules a post from Tuesday to Friday would get a reminder timed for the original Tuesday slot (or none at all if it already fired).

**How to apply:** any future "notify before X happens" feature on a mutable scheduled-time field should follow the same pattern — sentinel column + atomic claim + reset on time-change — rather than inventing a log table, unless multiple reminders per row are needed.

Wiring for a new push category / notification type touches 5 places every time (schema column → `push.ts` PushCategory map → `external/profile.ts` passthrough → `openapi.yaml` in 3 schemas: Vendor/VendorUpdate/ExternalProfileUpdate → mobile `account.tsx` toggle). Missing any one of these leaves a silent gap (e.g. a toggle that doesn't actually persist, or an API field the mobile client can't send).
