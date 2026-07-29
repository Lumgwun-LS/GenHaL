-- Store upload trial grants
CREATE TABLE IF NOT EXISTS store_upload_trials (
  id                serial PRIMARY KEY,
  developer_id      integer NOT NULL REFERENCES store_developer_accounts(id) ON DELETE CASCADE,
  expires_at        timestamp with time zone NOT NULL,
  granted_by_admin_id text,
  revoked_at        timestamp with time zone,
  note              text,
  created_at        timestamp NOT NULL DEFAULT now()
);

-- Trial flags on apps submitted under a trial grant
ALTER TABLE store_apps
  ADD COLUMN IF NOT EXISTS trial_upload      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_suspended_at timestamp with time zone;
