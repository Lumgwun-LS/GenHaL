-- Add vendorId FK to platform_partners (Connected Business feature)
-- Vendors can now self-register a Connected Business profile from their dashboard
ALTER TABLE platform_partners
  ADD COLUMN IF NOT EXISTS vendor_id integer REFERENCES vendors(id) ON DELETE SET NULL;

-- Index for fast lookup: find platform_partner by vendorId
CREATE UNIQUE INDEX IF NOT EXISTS platform_partners_vendor_id_idx
  ON platform_partners (vendor_id)
  WHERE vendor_id IS NOT NULL;

-- Update gitProvider to include bitbucket support (no constraint change needed — it's free-text)
-- bitbucket is now accepted alongside github and gitlab
