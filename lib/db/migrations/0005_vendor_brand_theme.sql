-- Adds a public storefront theme preset to vendors.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS brand_theme text NOT NULL DEFAULT 'violet';
