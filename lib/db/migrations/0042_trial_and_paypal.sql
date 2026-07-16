-- Free-trial tracking: when a Stripe trial ends; null while not in trial or after trial converts.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- PayPal subscription ID for platform billing — mirrors stripe_subscription_id / paystack_subscription_code.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS paypal_subscription_id text;
