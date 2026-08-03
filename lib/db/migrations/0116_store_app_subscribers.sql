CREATE TABLE IF NOT EXISTS "store_app_download_subscribers" (
  "id"            SERIAL PRIMARY KEY,
  "app_id"        INTEGER NOT NULL REFERENCES "store_apps"("id") ON DELETE CASCADE,
  "email"         TEXT NOT NULL,
  "subscribed_at" TIMESTAMP DEFAULT now() NOT NULL,
  UNIQUE("app_id", "email")
);

CREATE INDEX IF NOT EXISTS "store_app_subs_app_idx" ON "store_app_download_subscribers"("app_id");
