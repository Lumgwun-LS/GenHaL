-- Health-check bookkeeping for OAuth-connected social accounts (Facebook/Instagram).
-- See artifacts/api-server/src/lib/social-account-health.ts.
ALTER TABLE social_accounts
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_health_check_error text,
  ADD COLUMN IF NOT EXISTS health_check_failing_since timestamp with time zone;
