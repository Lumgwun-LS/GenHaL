-- Tracks whether the pre-publish reminder (push/email) has already gone out
-- for a scheduled post's current scheduledAt — see post-reminders.ts. Cleared
-- on reschedule so a new reminder can fire ahead of the new time.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- Per-vendor opt-out for the new "post about to publish" push category,
-- default on so existing vendors keep getting notified unless they opt out.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS push_post_reminders_enabled boolean NOT NULL DEFAULT true;
