-- Structured previous/new tier values for "tier_change" vendor_notifications rows,
-- so the admin plan-change history can render a clean table without parsing `message`.
ALTER TABLE vendor_notifications ADD COLUMN IF NOT EXISTS previous_tier text;
ALTER TABLE vendor_notifications ADD COLUMN IF NOT EXISTS new_tier text;
