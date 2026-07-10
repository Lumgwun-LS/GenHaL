-- Vendor self-service Stripe billing: customer + subscription tracking.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
