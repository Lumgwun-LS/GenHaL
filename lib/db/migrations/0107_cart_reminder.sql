-- Track when a cart-abandonment reminder email was sent for an order
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cart_reminder_sent_at timestamptz;
