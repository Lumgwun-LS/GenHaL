CREATE TABLE IF NOT EXISTS "admin_export_acknowledgment_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_user_id" text NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_by" text NOT NULL,
	"acknowledged_by_display_name" text
);
