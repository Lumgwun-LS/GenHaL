CREATE TABLE IF NOT EXISTS "job_run_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL UNIQUE,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_checked_count" integer,
	"last_affected_count" integer,
	"last_error" text,
	"consecutive_failures" integer NOT NULL DEFAULT 0,
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
