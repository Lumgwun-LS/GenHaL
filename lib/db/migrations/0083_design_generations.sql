CREATE TABLE IF NOT EXISTS "design_generations" (
  "id" serial PRIMARY KEY,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "category" text NOT NULL,
  "prompt" text NOT NULL,
  "style" text DEFAULT 'realistic',
  "image_url" text,
  "revised_prompt" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
