CREATE TABLE IF NOT EXISTS customer_complaints (
  id             SERIAL PRIMARY KEY,
  vendor_id      INTEGER NOT NULL,
  order_id       INTEGER,
  customer_id    INTEGER,
  customer_name  TEXT,
  customer_email TEXT NOT NULL,
  subject        TEXT NOT NULL,
  body           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open',
  admin_note     TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_complaints_vendor_id_idx ON customer_complaints(vendor_id);
CREATE INDEX IF NOT EXISTS customer_complaints_status_idx    ON customer_complaints(status);
