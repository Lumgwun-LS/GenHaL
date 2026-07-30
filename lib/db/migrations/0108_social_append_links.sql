ALTER TABLE vendors ADD COLUMN IF NOT EXISTS social_append_website boolean NOT NULL DEFAULT false;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS social_append_app_link boolean NOT NULL DEFAULT false;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS social_append_blog_link boolean NOT NULL DEFAULT false;
