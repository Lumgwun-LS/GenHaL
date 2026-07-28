ALTER TABLE "store_apps" ADD COLUMN IF NOT EXISTS "categories" jsonb NOT NULL DEFAULT '[]'::jsonb;
