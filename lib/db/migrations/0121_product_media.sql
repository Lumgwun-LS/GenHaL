-- Product media: multiple images and videos per product
CREATE TABLE IF NOT EXISTS "product_media" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "type" text NOT NULL DEFAULT 'image',
  "url" text NOT NULL,
  "caption" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "product_media_product_id_idx" ON "product_media" ("product_id");
CREATE INDEX IF NOT EXISTS "product_media_vendor_id_idx" ON "product_media" ("vendor_id");
