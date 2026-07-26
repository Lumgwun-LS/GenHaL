-- Tracks vendors who received a subscription refund within the 10-day window.
-- After a refund, the vendor may only subscribe to a tier strictly above
-- min_allowed_tier_rank (they cannot re-subscribe to the refunded tier or any lower tier).

CREATE TABLE subscription_refund_blacklist (
  id                   SERIAL PRIMARY KEY,
  vendor_id            INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  refunded_tier        TEXT NOT NULL,
  min_allowed_tier     TEXT NOT NULL,
  min_allowed_tier_rank INTEGER NOT NULL,
  gateway              TEXT NOT NULL,
  refund_reference     TEXT,
  refunded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_srb_vendor ON subscription_refund_blacklist(vendor_id);
