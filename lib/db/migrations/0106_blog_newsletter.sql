-- Newsletter opt-in on leads + platform blog opt-out on vendors
ALTER TABLE leads ADD COLUMN IF NOT EXISTS newsletter_opt_in boolean NOT NULL DEFAULT true;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS blog_featured_on_platform boolean NOT NULL DEFAULT true;
