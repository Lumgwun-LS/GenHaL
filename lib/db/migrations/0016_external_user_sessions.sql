CREATE TABLE IF NOT EXISTS "external_user_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"awajimaa_user_id" text NOT NULL,
	"awajimaa_user_type" text NOT NULL,
	"source" text DEFAULT 'awajimaa' NOT NULL,
	"jti" text NOT NULL,
	"is_revoked" text DEFAULT 'false' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_user_sessions_jti_unique" UNIQUE("jti")
);
