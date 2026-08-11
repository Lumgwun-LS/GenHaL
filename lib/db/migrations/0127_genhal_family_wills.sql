-- Family will & testament system

CREATE TABLE IF NOT EXISTS genhal_family_wills (
  id                   SERIAL PRIMARY KEY,
  family_id            INTEGER NOT NULL REFERENCES genhal_family_accounts(id) ON DELETE CASCADE,
  author_clerk_id      TEXT NOT NULL,
  author_name          TEXT NOT NULL,
  title                TEXT NOT NULL DEFAULT 'My Last Will & Testament',
  summary              TEXT,
  access_condition     TEXT,
  authorized_persons   TEXT NOT NULL DEFAULT '[]',
  encrypted_content    TEXT,
  encryption_iv        TEXT,
  encryption_salt      TEXT,
  encryption_auth_tag  TEXT,
  passphrase_verifier  TEXT,
  passphrase_salt      TEXT,
  linked_account_ids   TEXT NOT NULL DEFAULT '[]',
  status               TEXT NOT NULL DEFAULT 'active',
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at           TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gfw_family    ON genhal_family_wills(family_id);
CREATE INDEX IF NOT EXISTS idx_gfw_author    ON genhal_family_wills(author_clerk_id);
CREATE INDEX IF NOT EXISTS idx_gfw_status    ON genhal_family_wills(status);
