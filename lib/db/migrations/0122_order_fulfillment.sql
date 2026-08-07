-- Order fulfillment / delivery tracking
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "delivery_status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "tracking_number" text,
  ADD COLUMN IF NOT EXISTS "tracking_url" text,
  ADD COLUMN IF NOT EXISTS "shipped_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "customer_confirmed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "refund_note" text,
  -- Random token emailed to the customer so they can confirm receipt without an account
  ADD COLUMN IF NOT EXISTS "receipt_token" text UNIQUE;

CREATE INDEX IF NOT EXISTS "orders_receipt_token_idx" ON "orders" ("receipt_token");
