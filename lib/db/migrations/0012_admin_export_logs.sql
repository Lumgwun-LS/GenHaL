CREATE TABLE IF NOT EXISTS "admin_export_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "admin_user_id" text NOT NULL,
  "filters" text NOT NULL,
  "row_count" integer NOT NULL,
  "exported_at" timestamp with time zone DEFAULT now() NOT NULL
);
