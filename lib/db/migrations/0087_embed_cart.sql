-- Add source column to orders table to track embed-originated orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source text;
