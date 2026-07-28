-- Migration: vendor wallet & payout system
-- Creates four tables: vendor_wallets, wallet_transactions, vendor_payouts, vendor_bank_accounts

-- One wallet row per vendor -------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_wallets (
  id                 SERIAL PRIMARY KEY,
  vendor_id          INTEGER NOT NULL UNIQUE REFERENCES vendors(id) ON DELETE CASCADE,
  ngn_balance        NUMERIC(14,2) NOT NULL DEFAULT 0,
  usd_balance        NUMERIC(14,2) NOT NULL DEFAULT 0,
  pending_ngn_payout NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bank accounts saved for payout --------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_bank_accounts (
  id                     SERIAL PRIMARY KEY,
  vendor_id              INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  provider               TEXT    NOT NULL,
  bank_code              TEXT    NOT NULL,
  bank_name              TEXT    NOT NULL,
  account_number         TEXT    NOT NULL,
  account_name           TEXT    NOT NULL,
  paystack_recipient_code TEXT,
  is_default             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payout requests (pending → processing → completed/failed) -----------------------
CREATE TABLE IF NOT EXISTS vendor_payouts (
  id                 SERIAL PRIMARY KEY,
  vendor_id          INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  amount_ngn         NUMERIC(14,2) NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending',
  provider           TEXT NOT NULL,
  provider_reference TEXT,
  bank_account_id    INTEGER REFERENCES vendor_bank_accounts(id) ON DELETE SET NULL,
  notes                TEXT,
  failure_reason       TEXT,
  locked_usd_to_ngn_rate NUMERIC(12,4),
  requested_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transaction ledger (credit/debit/payout) ----------------------------------------
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id          SERIAL PRIMARY KEY,
  vendor_id   INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL,
  amount      NUMERIC(14,2) NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'NGN',
  order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  payout_id   INTEGER REFERENCES vendor_payouts(id) ON DELETE SET NULL,
  -- Unique per payment to prevent double-credit on webhook retry
  payment_id  INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  description TEXT    NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_payment_id_unique
  ON wallet_transactions(payment_id) WHERE payment_id IS NOT NULL;
