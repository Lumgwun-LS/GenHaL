-- Backfill: posts.social_account_ids was added to production as nullable
-- (IF NOT EXISTS skipped the NOT NULL enforcement in the original migration).
-- This corrects the data and re-applies the intended constraint.
UPDATE "posts" SET "social_account_ids" = '{}' WHERE "social_account_ids" IS NULL;
ALTER TABLE "posts" ALTER COLUMN "social_account_ids" SET NOT NULL;
ALTER TABLE "posts" ALTER COLUMN "social_account_ids" SET DEFAULT '{}';
