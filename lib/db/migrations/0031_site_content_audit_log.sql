CREATE TABLE IF NOT EXISTS "site_content_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"content_key" text NOT NULL,
	"admin_user_id" text NOT NULL,
	"admin_display_name" text,
	"old_value" text NOT NULL,
	"new_value" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
