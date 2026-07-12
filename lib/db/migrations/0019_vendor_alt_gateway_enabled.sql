ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "remita_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "flutterwave_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "nomba_enabled" boolean NOT NULL DEFAULT false;
