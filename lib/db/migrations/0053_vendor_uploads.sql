-- Track vendor-uploaded photos/videos so the media-cleanup job can sweep
-- abandoned uploads (never attached to a post) and uploads belonging to
-- deleted posts, just as it already does for AI-generated media.
CREATE TABLE IF NOT EXISTS "vendor_uploads" (
  "id" serial PRIMARY KEY NOT NULL,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "media_url" text NOT NULL,
  "media_type" text NOT NULL,
  "media_deleted_at" timestamp with time zone,
  "media_last_checked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
