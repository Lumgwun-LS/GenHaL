CREATE TABLE IF NOT EXISTS "blog_posts" (
  "id"                    serial PRIMARY KEY,
  "vendor_id"             integer NOT NULL,
  "title"                 text NOT NULL,
  "slug"                  text NOT NULL UNIQUE,
  "cover_image_url"       text,
  "body_html"             text NOT NULL DEFAULT '',
  "excerpt"               text,
  "keywords"              text[] NOT NULL DEFAULT '{}',
  "status"                text NOT NULL DEFAULT 'draft',
  "view_count"            integer NOT NULL DEFAULT 0,
  "like_count"            integer NOT NULL DEFAULT 0,
  "comment_count"         integer NOT NULL DEFAULT 0,
  "featured_on_platform"  boolean NOT NULL DEFAULT true,
  "published_at"          timestamptz,
  "created_at"            timestamptz NOT NULL DEFAULT now(),
  "updated_at"            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "blog_posts_vendor_id_idx" ON "blog_posts" ("vendor_id");
CREATE INDEX IF NOT EXISTS "blog_posts_status_idx"    ON "blog_posts" ("status");
CREATE INDEX IF NOT EXISTS "blog_posts_published_at_idx" ON "blog_posts" ("published_at" DESC);
