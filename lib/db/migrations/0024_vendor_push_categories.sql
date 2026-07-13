ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "push_payment_alerts_enabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "push_voice_campaign_alerts_enabled" boolean NOT NULL DEFAULT true;
