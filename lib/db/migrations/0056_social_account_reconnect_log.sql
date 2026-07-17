CREATE TABLE IF NOT EXISTS "social_account_reconnect_log" (
  "id" serial PRIMARY KEY,
  "social_account_id" integer NOT NULL REFERENCES "social_accounts"("id") ON DELETE CASCADE,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now()
);
