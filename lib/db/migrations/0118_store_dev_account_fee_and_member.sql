-- Migration: developer account fee (one-time, not per-app) + two-seat member support
ALTER TABLE store_developer_accounts
  ADD COLUMN IF NOT EXISTS member_clerk_user_id text,
  ADD COLUMN IF NOT EXISTS registration_fee_amount_kobo integer;

-- Change default to false for new accounts (existing rows keep their current true/false value)
ALTER TABLE store_developer_accounts
  ALTER COLUMN registration_fee_paid SET DEFAULT false;

-- Index for member lookups
CREATE INDEX IF NOT EXISTS idx_store_dev_accounts_member_clerk_user_id
  ON store_developer_accounts (member_clerk_user_id)
  WHERE member_clerk_user_id IS NOT NULL;
