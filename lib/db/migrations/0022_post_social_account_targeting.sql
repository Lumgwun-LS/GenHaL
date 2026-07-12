ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "social_account_ids" integer[] NOT NULL DEFAULT '{}';
