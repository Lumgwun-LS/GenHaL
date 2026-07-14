ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "announcement_email_opt_out" boolean NOT NULL DEFAULT false;
