-- GenHaL: Vault, Members/RBAC, Family Accounts, Subscriptions

-- ── Vault Documents ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS genhal_vault_documents (
  id                       SERIAL PRIMARY KEY,
  unit_type                TEXT NOT NULL,
  unit_id                  INTEGER NOT NULL,
  kingdom_id               INTEGER REFERENCES genhal_kingdoms(id) ON DELETE CASCADE,
  title                    TEXT NOT NULL,
  description              TEXT,
  access_instructions      TEXT,
  r2_key                   TEXT,
  file_url                 TEXT,
  file_name                TEXT,
  file_type                TEXT NOT NULL DEFAULT 'document',
  mime_type                TEXT,
  file_size_bytes          BIGINT,
  category                 TEXT,
  is_will                  BOOLEAN NOT NULL DEFAULT FALSE,
  tags                     TEXT[] NOT NULL DEFAULT '{}',
  attributes               JSONB,
  access_level             TEXT NOT NULL DEFAULT 'members',
  allowed_roles            TEXT[] NOT NULL DEFAULT '{}',
  is_password_protected    BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash            TEXT,
  upload_status            TEXT NOT NULL DEFAULT 'pending',
  is_archived              BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order               INTEGER NOT NULL DEFAULT 0,
  view_count               INTEGER NOT NULL DEFAULT 0,
  download_count           INTEGER NOT NULL DEFAULT 0,
  uploaded_by_clerk_user_id TEXT NOT NULL,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Vault Access Grants ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS genhal_vault_access_grants (
  id                       SERIAL PRIMARY KEY,
  document_id              INTEGER NOT NULL REFERENCES genhal_vault_documents(id) ON DELETE CASCADE,
  grantee_clerk_user_id    TEXT NOT NULL,
  granted_by_clerk_user_id TEXT NOT NULL,
  expires_at               TIMESTAMP,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Kingdom Members ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS genhal_kingdom_members (
  id                       SERIAL PRIMARY KEY,
  kingdom_id               INTEGER NOT NULL REFERENCES genhal_kingdoms(id) ON DELETE CASCADE,
  clerk_user_id            TEXT NOT NULL,
  role                     TEXT NOT NULL DEFAULT 'member',
  custom_title             TEXT,
  status                   TEXT NOT NULL DEFAULT 'active',
  joined_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  invited_by_clerk_user_id TEXT,
  notes                    TEXT,
  attributes               JSONB,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(kingdom_id, clerk_user_id)
);

-- ── Family Accounts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS genhal_family_accounts (
  id                       SERIAL PRIMARY KEY,
  kingdom_id               INTEGER REFERENCES genhal_kingdoms(id) ON DELETE SET NULL,
  compound_id              INTEGER,
  clerk_user_id            TEXT NOT NULL,
  name                     TEXT NOT NULL,
  local_name               TEXT,
  description              TEXT,
  country                  TEXT,
  region                   TEXT,
  district                 TEXT,
  cover_image_url          TEXT,
  emblem_image_url         TEXT,
  attributes               JSONB,
  is_public                BOOLEAN NOT NULL DEFAULT FALSE,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Family Members ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS genhal_family_members (
  id                       SERIAL PRIMARY KEY,
  family_id                INTEGER NOT NULL REFERENCES genhal_family_accounts(id) ON DELETE CASCADE,
  clerk_user_id            TEXT NOT NULL,
  role                     TEXT NOT NULL DEFAULT 'member',
  relationship             TEXT,
  custom_title             TEXT,
  status                   TEXT NOT NULL DEFAULT 'active',
  joined_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  invited_by_clerk_user_id TEXT,
  attributes               JSONB,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(family_id, clerk_user_id)
);

-- ── Subscriptions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS genhal_subscriptions (
  id                        SERIAL PRIMARY KEY,
  unit_type                 TEXT NOT NULL,
  unit_id                   INTEGER NOT NULL,
  plan                      TEXT NOT NULL DEFAULT 'free',
  status                    TEXT NOT NULL DEFAULT 'active',
  stripe_subscription_id    TEXT,
  stripe_customer_id        TEXT,
  paystack_subscription_code TEXT,
  paystack_customer_code    TEXT,
  current_period_start      TIMESTAMP,
  current_period_end        TIMESTAMP,
  trial_ends_at             TIMESTAMP,
  cancelled_at              TIMESTAMP,
  cancel_at_period_end      BOOLEAN NOT NULL DEFAULT FALSE,
  storage_limit_bytes       BIGINT NOT NULL DEFAULT 524288000,
  max_members               INTEGER NOT NULL DEFAULT 10,
  max_vault_documents       INTEGER NOT NULL DEFAULT 20,
  storage_used_bytes        BIGINT NOT NULL DEFAULT 0,
  vault_document_count      INTEGER NOT NULL DEFAULT 0,
  member_count              INTEGER NOT NULL DEFAULT 0,
  currency                  TEXT NOT NULL DEFAULT 'usd',
  price_amount              REAL,
  created_by_clerk_user_id  TEXT NOT NULL,
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vault_docs_unit       ON genhal_vault_documents(unit_type, unit_id);
CREATE INDEX IF NOT EXISTS idx_vault_docs_kingdom    ON genhal_vault_documents(kingdom_id);
CREATE INDEX IF NOT EXISTS idx_kingdom_members_kid   ON genhal_kingdom_members(kingdom_id);
CREATE INDEX IF NOT EXISTS idx_kingdom_members_user  ON genhal_kingdom_members(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_family_members_fid    ON genhal_family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_accounts_kid   ON genhal_family_accounts(kingdom_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_unit    ON genhal_subscriptions(unit_type, unit_id);
