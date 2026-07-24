-- Add is_platform_app flag to distinguish Awajimaa's own first-party apps
-- from vendor submissions (no fee, no review, auto-approved).
ALTER TABLE store_apps ADD COLUMN IF NOT EXISTS is_platform_app boolean NOT NULL DEFAULT false;
