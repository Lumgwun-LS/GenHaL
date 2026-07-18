-- Add optional payment_id column to admin_audit_log so that
-- payment_conflict_resolution entries can link back to the payment.
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS payment_id integer;
