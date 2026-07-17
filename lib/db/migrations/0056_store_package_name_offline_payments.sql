-- Add package_name to store_apps (immutable bundle identifier)
ALTER TABLE store_apps ADD COLUMN IF NOT EXISTS package_name text;

-- Offline payment requests table
CREATE TABLE IF NOT EXISTS store_offline_payments (
  id serial PRIMARY KEY,
  app_id integer NOT NULL REFERENCES store_apps(id) ON DELETE CASCADE,
  developer_id integer NOT NULL REFERENCES store_developer_accounts(id) ON DELETE CASCADE,
  proof_url text NOT NULL,
  proof_note text,
  amount_paid text,
  bank_reference text,
  status text NOT NULL DEFAULT 'submitted',
  admin_approved_by_clerk_id text,
  admin_approved_at timestamp,
  admin_note text,
  super_approved_by_clerk_id text,
  super_approved_at timestamp,
  super_note text,
  rejected_by_clerk_id text,
  rejected_at timestamp,
  rejection_reason text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
