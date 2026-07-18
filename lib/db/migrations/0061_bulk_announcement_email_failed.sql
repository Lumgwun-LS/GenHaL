-- Add email_failed flag to vendor_notifications so failed bulk-announcement
-- emails can be tracked per vendor row and retried from the message history tab.
ALTER TABLE vendor_notifications
  ADD COLUMN IF NOT EXISTS email_failed BOOLEAN;
