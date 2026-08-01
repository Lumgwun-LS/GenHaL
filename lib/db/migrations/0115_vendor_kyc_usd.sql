-- Add KYC fields to vendors table for Squad USD virtual account provisioning.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bvn text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS kyc_submitted_at timestamptz;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS squad_customer_identifier text;
