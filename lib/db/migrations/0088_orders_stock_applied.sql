ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_applied boolean NOT NULL DEFAULT false;
