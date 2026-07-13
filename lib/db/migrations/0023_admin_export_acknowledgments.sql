CREATE TABLE IF NOT EXISTS "admin_export_acknowledgments" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_user_id" text NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_by" text NOT NULL,
	CONSTRAINT "admin_export_acknowledgments_admin_user_id_unique" UNIQUE("admin_user_id")
);
