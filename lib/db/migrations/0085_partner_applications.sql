-- Add self-service application fields to platform_partners
ALTER TABLE platform_partners
  ADD COLUMN IF NOT EXISTS application_status text NOT NULL DEFAULT 'admin_created',
  ADD COLUMN IF NOT EXISTS applicant_name text,
  ADD COLUMN IF NOT EXISTS rejection_reason text;
