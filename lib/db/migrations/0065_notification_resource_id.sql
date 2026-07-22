-- Add resource_id to vendor_notifications so notifications can deep-link to
-- the specific post or voice campaign that triggered the alert.
ALTER TABLE vendor_notifications ADD COLUMN IF NOT EXISTS resource_id integer;
