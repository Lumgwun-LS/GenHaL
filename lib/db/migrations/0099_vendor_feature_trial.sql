-- Admin-granted feature-level trial: lets an admin bump a vendor's effective tier
-- for a fixed window without touching their Stripe subscription. The scheduler
-- and subscription sync both respect these columns before downgrading.
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS feature_trial_tier       text,
  ADD COLUMN IF NOT EXISTS feature_trial_expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS feature_trial_granted_by text,
  ADD COLUMN IF NOT EXISTS feature_trial_granted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS feature_trial_note       text;
