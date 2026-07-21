ALTER TABLE "social_accounts" ADD COLUMN IF NOT EXISTS "expiry_warning_sent_at" TIMESTAMP WITH TIME ZONE;
