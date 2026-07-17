-- Adds warning-sent tracking columns to ai_generations and vendor_uploads so
-- the media-cleanup job can send vendors a heads-up before their unused
-- AI-generated or uploaded media is swept. Also adds a per-vendor push
-- preference for this category of notification.

ALTER TABLE ai_generations
  ADD COLUMN IF NOT EXISTS media_warning_sent_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE vendor_uploads
  ADD COLUMN IF NOT EXISTS media_warning_sent_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS push_ai_media_expiry_enabled BOOLEAN NOT NULL DEFAULT TRUE;
