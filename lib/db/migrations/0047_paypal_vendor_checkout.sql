-- Add paypalEnabled flag to vendors so admins can enable PayPal per-vendor storefront checkout
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS paypal_enabled boolean NOT NULL DEFAULT false;
