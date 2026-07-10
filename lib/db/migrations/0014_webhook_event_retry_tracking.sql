ALTER TABLE "webhook_events" ADD COLUMN IF NOT EXISTS "retry_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "webhook_events" ADD COLUMN IF NOT EXISTS "last_retried_at" timestamp with time zone;
