ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "social_account_ids" integer[];
UPDATE "posts" SET "social_account_ids" = '{}' WHERE "social_account_ids" IS NULL;
ALTER TABLE "posts" ALTER COLUMN "social_account_ids" SET NOT NULL;
ALTER TABLE "posts" ALTER COLUMN "social_account_ids" SET DEFAULT '{}';
