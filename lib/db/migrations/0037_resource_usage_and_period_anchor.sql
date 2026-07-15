ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "current_period_start" timestamp with time zone NOT NULL DEFAULT now();
-- Backfill existing vendors to their signup date so their first metering
-- period starts there instead of at migration-run time.
UPDATE "vendors" SET "current_period_start" = "created_at" WHERE "current_period_start" IS NULL OR "current_period_start" = now();

ALTER TABLE "voice_call_logs" ADD COLUMN IF NOT EXISTS "metered_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "resource_usage" (
  "id" serial PRIMARY KEY NOT NULL,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "resource" text NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "used" numeric(14, 2) NOT NULL DEFAULT '0',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "resource_usage_vendor_resource_period_unique" UNIQUE ("vendor_id", "resource", "period_start")
);
