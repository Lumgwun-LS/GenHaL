CREATE TABLE IF NOT EXISTS "draft_video_scenes" (
  "vendor_id" integer PRIMARY KEY NOT NULL,
  "scenes" jsonb NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "draft_video_scenes_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE cascade
);
