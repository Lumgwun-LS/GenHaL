-- Migration: vendor_ad_accounts
-- Stores per-vendor ad platform connections (Meta, X/Twitter, etc.)

CREATE TABLE IF NOT EXISTS vendor_ad_accounts (
  id               SERIAL PRIMARY KEY,
  vendor_id        INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  account_name     TEXT,
  status           TEXT NOT NULL DEFAULT 'active',
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_ad_accounts_vendor
  ON vendor_ad_accounts(vendor_id);
