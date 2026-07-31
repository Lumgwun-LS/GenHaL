-- Customer birthday tracking
ALTER TABLE customers ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS voice_birthday_opt_out boolean NOT NULL DEFAULT false;

-- CRM lead birthday tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS date_of_birth date;

-- Birthday message logs: add fields for customer/lead birthday messages
ALTER TABLE birthday_message_logs ADD COLUMN IF NOT EXISTS customer_id integer;
ALTER TABLE birthday_message_logs ADD COLUMN IF NOT EXISTS lead_id integer;
ALTER TABLE birthday_message_logs ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE birthday_message_logs ADD COLUMN IF NOT EXISTS recipient_email text;

-- Per-lead birthday log dedup: one row per lead per channel per UTC calendar day
CREATE UNIQUE INDEX IF NOT EXISTS birthday_logs_lead_channel_day_uniq
  ON birthday_message_logs (lead_id, channel, DATE(sent_at AT TIME ZONE 'UTC'))
  WHERE lead_id IS NOT NULL;

-- Per-customer birthday log dedup: one row per customer per channel per UTC calendar day
CREATE UNIQUE INDEX IF NOT EXISTS birthday_logs_customer_channel_day_uniq
  ON birthday_message_logs (customer_id, channel, DATE(sent_at AT TIME ZONE 'UTC'))
  WHERE customer_id IS NOT NULL;
