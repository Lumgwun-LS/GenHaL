CREATE TABLE IF NOT EXISTS "store_ai_launch_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "developer_id" integer NOT NULL REFERENCES "store_developer_accounts"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'uploading',
  "error_message" text,
  "extracted_files" jsonb,
  "ai_generated" jsonb,
  "app_id" integer REFERENCES "store_apps"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
