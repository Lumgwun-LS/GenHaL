-- Version control enhancements: versionCode ordering, who uploaded/activated, file size
ALTER TABLE store_app_versions
  ADD COLUMN IF NOT EXISTS version_code    integer,
  ADD COLUMN IF NOT EXISTS file_size       bigint,
  ADD COLUMN IF NOT EXISTS min_os_version  text,
  ADD COLUMN IF NOT EXISTS uploaded_by_clerk_id text,
  ADD COLUMN IF NOT EXISTS activated_at   timestamp,
  ADD COLUMN IF NOT EXISTS activated_by_clerk_id text;

-- Ensure at most one version per app is live (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS store_app_versions_one_live
  ON store_app_versions (app_id)
  WHERE status = 'live';
