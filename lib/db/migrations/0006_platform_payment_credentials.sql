-- Platform-level (admin-managed) payment gateway credentials.
CREATE TABLE IF NOT EXISTS platform_payment_credentials (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  credentials_encrypted TEXT NOT NULL,
  test_passed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
