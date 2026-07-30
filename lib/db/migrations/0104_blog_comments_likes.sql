CREATE TABLE IF NOT EXISTS "blog_comments" (
  "id"                serial PRIMARY KEY,
  "post_id"           integer NOT NULL REFERENCES "blog_posts"("id") ON DELETE CASCADE,
  "vendor_id"         integer NOT NULL,
  "commenter_name"    text NOT NULL,
  "commenter_email"   text NOT NULL,
  "commenter_phone"   text,
  "body"              text NOT NULL,
  "created_at"        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "blog_comments_post_id_idx"   ON "blog_comments"("post_id");
CREATE INDEX IF NOT EXISTS "blog_comments_vendor_id_idx" ON "blog_comments"("vendor_id");
CREATE INDEX IF NOT EXISTS "blog_comments_email_idx"     ON "blog_comments"("commenter_email");

CREATE TABLE IF NOT EXISTS "blog_post_likes" (
  "id"            serial PRIMARY KEY,
  "post_id"       integer NOT NULL REFERENCES "blog_posts"("id") ON DELETE CASCADE,
  "visitor_token" text NOT NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("post_id", "visitor_token")
);

CREATE INDEX IF NOT EXISTS "blog_post_likes_post_id_idx" ON "blog_post_likes"("post_id");
