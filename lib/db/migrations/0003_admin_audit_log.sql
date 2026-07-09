-- Migration: Admin Audit Log
-- Records every admin change to a vendor's subscription tier or verification level.
-- Applied: 2026-07-09

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            SERIAL PRIMARY KEY,
  admin_user_id TEXT        NOT NULL,
  vendor_id     INTEGER     NOT NULL,
  field         TEXT        NOT NULL,   -- 'subscriptionTier' | 'verificationLevel'
  old_value     TEXT        NOT NULL,
  new_value     TEXT        NOT NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookups by vendor and by time range
CREATE INDEX IF NOT EXISTS admin_audit_log_vendor_id_idx  ON admin_audit_log (vendor_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_changed_at_idx ON admin_audit_log (changed_at DESC);
