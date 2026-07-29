-- Platform-level user registry — one row per Clerk user regardless of
-- whether they completed vendor onboarding.
CREATE TABLE IF NOT EXISTS platform_users (
  id                    serial PRIMARY KEY,
  clerk_user_id         text NOT NULL UNIQUE,
  email                 text,
  name                  text,
  phone                 text,
  image_url             text,
  onboarding_completed  boolean NOT NULL DEFAULT false,
  vendor_id             integer REFERENCES vendors(id) ON DELETE SET NULL,
  first_seen_at         timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at          timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_users_email       ON platform_users(email);
CREATE INDEX IF NOT EXISTS idx_platform_users_last_seen   ON platform_users(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_users_onboarding  ON platform_users(onboarding_completed);
