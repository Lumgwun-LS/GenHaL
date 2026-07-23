-- Add billing_blocked flag and deleted_at to vendors table
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS billing_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
