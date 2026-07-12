ALTER TABLE "social_accounts" ADD COLUMN IF NOT EXISTS "connected_via" text NOT NULL DEFAULT 'manual';
ALTER TABLE "social_accounts" ADD COLUMN IF NOT EXISTS "access_token_encrypted" text;
ALTER TABLE "social_accounts" ADD COLUMN IF NOT EXISTS "token_expires_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "post_publications" (
  "id" serial PRIMARY KEY NOT NULL,
  "post_id" integer NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "social_account_id" integer REFERENCES "social_accounts"("id") ON DELETE SET NULL,
  "platform" text NOT NULL,
  "status" text NOT NULL,
  "external_post_id" text,
  "external_url" text,
  "error_message" text,
  "published_at" timestamp with time zone NOT NULL DEFAULT now()
);
