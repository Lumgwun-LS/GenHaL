CREATE TABLE IF NOT EXISTS "voice_signature_failure_acknowledgments" (
	"id" serial PRIMARY KEY NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "voice_signature_failure_acknowledgment_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_by" text NOT NULL,
	"acknowledged_by_display_name" text
);
