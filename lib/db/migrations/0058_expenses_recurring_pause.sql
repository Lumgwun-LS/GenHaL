ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "recurring_paused" boolean DEFAULT false NOT NULL;
