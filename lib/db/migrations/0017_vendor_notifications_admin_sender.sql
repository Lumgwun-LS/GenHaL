ALTER TABLE "vendor_notifications" ADD COLUMN IF NOT EXISTS "admin_user_id" text;
ALTER TABLE "vendor_notifications" ADD COLUMN IF NOT EXISTS "admin_display_name" text;
