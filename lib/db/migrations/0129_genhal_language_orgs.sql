-- Language Organisations: professional custodians of local languages on GenHaL.
-- Orgs register, get platform-approved, then review submitted corpus data.

CREATE TABLE IF NOT EXISTS genhal_language_orgs (
  id                       SERIAL PRIMARY KEY,
  name                     TEXT NOT NULL,
  slug                     TEXT NOT NULL UNIQUE,
  description              TEXT,
  logo_url                 TEXT,
  website                  TEXT,
  contact_email            TEXT,
  country                  TEXT,
  founded_year             INTEGER,
  clerk_user_id            TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'pending',
  admin_notes              TEXT,
  reviewed_by_clerk_user_id TEXT,
  reviewed_at              TIMESTAMP,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS genhal_language_org_members (
  id                       SERIAL PRIMARY KEY,
  org_id                   INTEGER NOT NULL REFERENCES genhal_language_orgs(id) ON DELETE CASCADE,
  clerk_user_id            TEXT NOT NULL,
  role                     TEXT NOT NULL DEFAULT 'contributor',
  status                   TEXT NOT NULL DEFAULT 'active',
  invited_by_clerk_user_id TEXT,
  joined_at                TIMESTAMP DEFAULT NOW(),
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, clerk_user_id)
);

CREATE TABLE IF NOT EXISTS genhal_language_org_languages (
  id               SERIAL PRIMARY KEY,
  org_id           INTEGER NOT NULL REFERENCES genhal_language_orgs(id) ON DELETE CASCADE,
  language_code    TEXT NOT NULL REFERENCES genhal_languages(code) ON DELETE CASCADE,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  is_primary_org   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, language_code)
);

-- Org-level approval columns on dataset submissions
ALTER TABLE genhal_language_datasets
  ADD COLUMN IF NOT EXISTS org_approval_status         TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS org_reviewed_by_clerk_user_id TEXT,
  ADD COLUMN IF NOT EXISTS org_reviewed_at             TIMESTAMP,
  ADD COLUMN IF NOT EXISTS org_rejection_reason        TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS genhal_language_orgs_status   ON genhal_language_orgs (status);
CREATE INDEX IF NOT EXISTS genhal_org_members_clerk      ON genhal_language_org_members (clerk_user_id);
CREATE INDEX IF NOT EXISTS genhal_org_lang_code          ON genhal_language_org_languages (language_code);
CREATE INDEX IF NOT EXISTS genhal_datasets_org_approval  ON genhal_language_datasets (org_approval_status);
