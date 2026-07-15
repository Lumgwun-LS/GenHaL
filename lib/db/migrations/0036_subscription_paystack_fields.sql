ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "subscription_provider" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "paystack_customer_code" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "paystack_subscription_code" text;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "paystack_email_token" text;
