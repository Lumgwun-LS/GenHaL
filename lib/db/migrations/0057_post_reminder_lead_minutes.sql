-- Add per-vendor post reminder lead time preference (minutes before scheduledAt).
-- Default 30 mirrors the previous hard-coded REMINDER_LEAD_MINUTES constant so
-- existing vendors see no behaviour change.
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS post_reminder_lead_minutes integer NOT NULL DEFAULT 30;
