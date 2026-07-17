CREATE TABLE IF NOT EXISTS vendor_addon_credits (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  units_granted NUMERIC(14, 2) NOT NULL,
  units_remaining NUMERIC(14, 2) NOT NULL DEFAULT 0,
  unit_rate_usd NUMERIC(10, 4) NOT NULL,
  total_paid_usd NUMERIC(10, 4) NOT NULL,
  gateway TEXT NOT NULL,
  gateway_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_addon_credits_vendor_id ON vendor_addon_credits(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_addon_credits_status ON vendor_addon_credits(vendor_id, resource, status);
CREATE INDEX IF NOT EXISTS idx_vendor_addon_credits_gateway_payment ON vendor_addon_credits(gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;
