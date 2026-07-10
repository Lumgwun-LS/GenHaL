-- Expo push tokens for instant phone alerts (payment status changes, etc.)
CREATE TABLE IF NOT EXISTS vendor_push_tokens (
  id serial PRIMARY KEY,
  vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
