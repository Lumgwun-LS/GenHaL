-- Track product interest for CRM-based email reminders
ALTER TABLE leads ADD COLUMN IF NOT EXISTS interested_product_ids text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS product_reminder_sent_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS shop_slug text;
