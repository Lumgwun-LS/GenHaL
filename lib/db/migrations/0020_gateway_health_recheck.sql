ALTER TABLE "platform_payment_credentials" ADD COLUMN IF NOT EXISTS "last_checked_at" timestamp with time zone;
ALTER TABLE "platform_payment_credentials" ADD COLUMN IF NOT EXISTS "last_failure_reason" text;
ALTER TABLE "platform_payment_credentials" ADD COLUMN IF NOT EXISTS "failing_since" timestamp with time zone;
