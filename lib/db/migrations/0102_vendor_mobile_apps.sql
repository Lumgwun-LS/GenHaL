CREATE TABLE IF NOT EXISTS "vendor_mobile_apps" (
  "id"              serial PRIMARY KEY,
  "vendor_id"       integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "source"          text NOT NULL DEFAULT 'website',
  "website_url"     text,
  "repo_url"        text,
  "repo_branch"     text,
  "app_name"        text NOT NULL,
  "app_slug"        text NOT NULL,
  "package_name"    text NOT NULL,
  "icon_url"        text,
  "splash_url"      text,
  "eas_project_id"  text,
  "eas_build_id"    text,
  "apk_url"         text,
  "store_app_id"    integer REFERENCES "store_apps"("id") ON DELETE SET NULL,
  "status"          text NOT NULL DEFAULT 'queued',
  "error_message"   text,
  "last_checked_at" timestamp,
  "created_at"      timestamp NOT NULL DEFAULT now(),
  "updated_at"      timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "vendor_mobile_apps_vendor_id_idx" ON "vendor_mobile_apps"("vendor_id");
CREATE INDEX IF NOT EXISTS "vendor_mobile_apps_status_idx"    ON "vendor_mobile_apps"("status");
