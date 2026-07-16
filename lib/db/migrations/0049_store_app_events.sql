CREATE TABLE IF NOT EXISTS "store_app_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "app_id" integer NOT NULL REFERENCES "store_apps"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "session_id" text,
  "clerk_user_id" text,
  "country" text,
  "user_agent" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "store_app_events_app_id_idx" ON "store_app_events"("app_id");
CREATE INDEX IF NOT EXISTS "store_app_events_event_type_idx" ON "store_app_events"("event_type");
CREATE INDEX IF NOT EXISTS "store_app_events_created_at_idx" ON "store_app_events"("created_at");
