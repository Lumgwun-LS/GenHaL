CREATE TABLE IF NOT EXISTS vendor_ratings (
  id                   SERIAL PRIMARY KEY,
  vendor_id            INTEGER NOT NULL,
  order_id             INTEGER,
  customer_id          INTEGER,
  customer_name        TEXT,
  customer_email       TEXT,
  rating               INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review               TEXT,
  is_public            BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  is_flagged           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vendor_ratings_vendor_id_idx ON vendor_ratings(vendor_id);
CREATE INDEX IF NOT EXISTS vendor_ratings_order_id_idx  ON vendor_ratings(order_id);
