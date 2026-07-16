CREATE TABLE IF NOT EXISTS "admin_export_burst_sent_alerts" (
  "id" serial PRIMARY KEY NOT NULL,
  "admin_user_id" text NOT NULL,
  "crossing_export_id" integer NOT NULL,
  "sent_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "uq_export_burst_alert" UNIQUE("admin_user_id", "crossing_export_id")
);
