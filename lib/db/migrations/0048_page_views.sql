CREATE TABLE IF NOT EXISTS "page_views" (
  "id" serial PRIMARY KEY NOT NULL,
  "platform" text NOT NULL,
  "path" text NOT NULL,
  "referrer" text,
  "user_agent" text,
  "session_id" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
