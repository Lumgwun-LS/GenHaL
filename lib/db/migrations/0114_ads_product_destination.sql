-- Ads Studio: product linking, destination URL, UTM tracking
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS product_id   integer REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS destination_url text;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS utm_source  text;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS utm_medium  text DEFAULT 'paid';
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS utm_campaign text;

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_product ON ad_campaigns(product_id) WHERE product_id IS NOT NULL;
