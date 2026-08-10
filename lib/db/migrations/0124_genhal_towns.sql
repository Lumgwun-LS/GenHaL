-- genhal_towns: Town entities with civic governance metadata
CREATE TABLE IF NOT EXISTS genhal_towns (
  id               SERIAL PRIMARY KEY,
  community_id     INTEGER REFERENCES genhal_communities(id) ON DELETE SET NULL,
  clerk_user_id    TEXT NOT NULL,
  name             TEXT NOT NULL,
  local_name       TEXT,
  language_code    TEXT,
  country          TEXT,
  region           TEXT,
  district         TEXT,
  latitude         REAL,
  longitude        REAL,
  founded_year     INTEGER,
  description      TEXT,
  cover_image_url  TEXT,
  emblem_image_url TEXT,
  ruler_title      TEXT NOT NULL DEFAULT 'King',
  chief_title      TEXT NOT NULL DEFAULT 'Chief',
  is_public        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_genhal_towns_community ON genhal_towns (community_id);
CREATE INDEX IF NOT EXISTS idx_genhal_towns_user      ON genhal_towns (clerk_user_id);

-- genhal_town_rulers: King / ruler succession timeline per town
CREATE TABLE IF NOT EXISTS genhal_town_rulers (
  id                SERIAL PRIMARY KEY,
  town_id           INTEGER NOT NULL REFERENCES genhal_towns(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  local_name        TEXT,
  title             TEXT NOT NULL,
  reign_start       INTEGER,
  reign_end         INTEGER,
  is_current        BOOLEAN NOT NULL DEFAULT FALSE,
  bio               TEXT,
  achievements      TEXT,
  image_url         TEXT,
  tree_id           INTEGER,
  member_id         INTEGER,
  succession_notes  TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_genhal_rulers_town ON genhal_town_rulers (town_id);

-- genhal_compounds: Compounds (family quarters) within a town
CREATE TABLE IF NOT EXISTS genhal_compounds (
  id                  SERIAL PRIMARY KEY,
  town_id             INTEGER NOT NULL REFERENCES genhal_towns(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  local_name          TEXT,
  description         TEXT,
  image_url           TEXT,
  head_family_tree_id INTEGER,
  linked_tree_ids     JSONB DEFAULT '[]',
  chief_title         TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_genhal_compounds_town ON genhal_compounds (town_id);

-- genhal_compound_chiefs: Chief succession timeline per compound
CREATE TABLE IF NOT EXISTS genhal_compound_chiefs (
  id               SERIAL PRIMARY KEY,
  compound_id      INTEGER NOT NULL REFERENCES genhal_compounds(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  local_name       TEXT,
  title            TEXT NOT NULL,
  reign_start      INTEGER,
  reign_end        INTEGER,
  is_current       BOOLEAN NOT NULL DEFAULT FALSE,
  bio              TEXT,
  image_url        TEXT,
  tree_id          INTEGER,
  member_id        INTEGER,
  succession_notes TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_genhal_chiefs_compound ON genhal_compound_chiefs (compound_id);

-- genhal_town_records: History, traditions, festivals, ceremonies, resources, economic activity
CREATE TABLE IF NOT EXISTS genhal_town_records (
  id          SERIAL PRIMARY KEY,
  town_id     INTEGER NOT NULL REFERENCES genhal_towns(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT,
  period      TEXT,
  image_url   TEXT,
  media_urls  JSONB DEFAULT '[]',
  tags        JSONB DEFAULT '[]',
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_genhal_records_town ON genhal_town_records (town_id);
CREATE INDEX IF NOT EXISTS idx_genhal_records_type  ON genhal_town_records (type);
