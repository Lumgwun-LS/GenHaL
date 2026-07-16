-- Tracks pay-as-you-go overage charges when a vendor exhausts their plan's
-- included monthly credits. One row per vendor × resource × billing period;
-- accumulates via UPSERT as usage exceeds the plan quota.
CREATE TABLE IF NOT EXISTS vendor_overage_charges (
  id serial PRIMARY KEY,
  vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  resource text NOT NULL,
  period_start timestamptz NOT NULL,
  units numeric(14, 2) NOT NULL DEFAULT 0,
  unit_rate_usd numeric(10, 4) NOT NULL,
  total_usd numeric(10, 4) NOT NULL,
  stripe_invoice_item_id text,      -- set once a Stripe invoice item is created
  settled_at timestamptz,           -- null while open; set when the period closes and overage is billed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_overage_charges_vendor_resource_period_unique UNIQUE (vendor_id, resource, period_start)
);
