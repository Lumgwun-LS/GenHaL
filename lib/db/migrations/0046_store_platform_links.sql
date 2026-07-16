-- store_linked_accounts: developer's connected platforms (GitHub, GitLab, Heroku, etc.)
CREATE TABLE IF NOT EXISTS store_linked_accounts (
  id SERIAL PRIMARY KEY,
  developer_id INTEGER NOT NULL REFERENCES store_developer_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  access_token TEXT NOT NULL,
  instance_url TEXT,
  avatar_url TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- store_app_repo_links: links one app to a specific repo/branch/deployment
CREATE TABLE IF NOT EXISTS store_app_repo_links (
  id SERIAL PRIMARY KEY,
  app_id INTEGER NOT NULL REFERENCES store_apps(id) ON DELETE CASCADE,
  linked_account_id INTEGER NOT NULL REFERENCES store_linked_accounts(id) ON DELETE CASCADE,
  repo_path TEXT NOT NULL,
  branch TEXT DEFAULT 'main',
  deployment_url TEXT,
  last_commit_sha TEXT,
  last_commit_message TEXT,
  last_commit_author TEXT,
  last_commit_url TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- store_app_update_requests: developer-initiated updates pending super-admin approval
CREATE TABLE IF NOT EXISTS store_app_update_requests (
  id SERIAL PRIMARY KEY,
  app_id INTEGER NOT NULL REFERENCES store_apps(id) ON DELETE CASCADE,
  developer_id INTEGER NOT NULL REFERENCES store_developer_accounts(id) ON DELETE CASCADE,
  repo_link_id INTEGER REFERENCES store_app_repo_links(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  repo_path TEXT,
  commit_sha TEXT,
  commit_message TEXT,
  commit_url TEXT,
  commit_author TEXT,
  new_version TEXT,
  new_download_url TEXT,
  new_description TEXT,
  changes_summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_user_id TEXT,
  admin_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_linked_accounts_developer ON store_linked_accounts(developer_id);
CREATE INDEX IF NOT EXISTS idx_store_app_repo_links_app ON store_app_repo_links(app_id);
CREATE INDEX IF NOT EXISTS idx_store_update_requests_status ON store_app_update_requests(status);
CREATE INDEX IF NOT EXISTS idx_store_update_requests_app ON store_app_update_requests(app_id);
