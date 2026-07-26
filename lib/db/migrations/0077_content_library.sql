CREATE TABLE IF NOT EXISTS "vendor_content_library" (
  "id" serial PRIMARY KEY,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "topic" text NOT NULL,
  "content" text NOT NULL,
  "image_url" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
