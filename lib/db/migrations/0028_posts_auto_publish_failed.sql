ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "auto_publish_failed" boolean NOT NULL DEFAULT false;
