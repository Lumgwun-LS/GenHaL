-- Add build fee tracking columns to vendor_mobile_apps
ALTER TABLE vendor_mobile_apps
  ADD COLUMN IF NOT EXISTS fee_paid   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fee_ref    text,
  ADD COLUMN IF NOT EXISTS fee_amount integer;
