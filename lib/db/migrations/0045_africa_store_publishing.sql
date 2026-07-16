-- Africa App Store: per-app publishing fee + dedicated virtual accounts
ALTER TABLE store_developer_accounts
  ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT,
  ADD COLUMN IF NOT EXISTS dedicated_ngn_account JSONB,
  ADD COLUMN IF NOT EXISTS dedicated_usd_account JSONB;

-- Update stale pending_payment developers to active (registration is now free)
UPDATE store_developer_accounts SET status = 'active' WHERE status = 'pending_payment';

-- Per-app NGN 25,000 publishing fee columns
ALTER TABLE store_apps
  ADD COLUMN IF NOT EXISTS publishing_fee_paid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS publishing_fee_ref TEXT,
  ADD COLUMN IF NOT EXISTS publishing_fee_gateway TEXT,
  ADD COLUMN IF NOT EXISTS publishing_fee_amount_kobo INTEGER;
