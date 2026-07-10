-- Vendor demographics (nullable, optional profile fields).
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS city TEXT;

-- Self-service account deletion: one-time email + phone codes required to confirm.
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  email_code_hash TEXT NOT NULL,
  phone_code_hash TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
