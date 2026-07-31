-- NOWPayments (USDT crypto) gateway toggle
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS nowpayments_enabled boolean NOT NULL DEFAULT false;

-- Stripe Connect — vendor dedicated sub-accounts
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS stripe_connect_onboarded boolean NOT NULL DEFAULT false;
