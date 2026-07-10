ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "product_ids" integer[] NOT NULL DEFAULT '{}';
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "link_mode" text NOT NULL DEFAULT 'none';
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "share_token" text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_share_token_unique') THEN
    ALTER TABLE "posts" ADD CONSTRAINT "posts_share_token_unique" UNIQUE ("share_token");
  END IF;
END $$;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "product_id" integer;
