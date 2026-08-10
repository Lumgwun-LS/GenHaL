-- Kingdom civic layer: Languages, Geopoints, Economic Activities, Schools, Churches

CREATE TABLE IF NOT EXISTS genhal_kingdom_languages (
  id SERIAL PRIMARY KEY,
  kingdom_id INTEGER NOT NULL REFERENCES genhal_kingdoms(id) ON DELETE CASCADE,
  language_code TEXT,
  name TEXT NOT NULL,
  local_name TEXT,
  is_official BOOLEAN NOT NULL DEFAULT false,
  speaker_count INTEGER,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS genhal_kingdom_geopoints (
  id SERIAL PRIMARY KEY,
  kingdom_id INTEGER NOT NULL REFERENCES genhal_kingdoms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'landmark',
  latitude REAL,
  longitude REAL,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS genhal_kingdom_economic_activities (
  id SERIAL PRIMARY KEY,
  kingdom_id INTEGER NOT NULL REFERENCES genhal_kingdoms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'agriculture',
  description TEXT,
  scale TEXT,
  is_main BOOLEAN NOT NULL DEFAULT false,
  seasonality TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS genhal_kingdom_schools (
  id SERIAL PRIMARY KEY,
  kingdom_id INTEGER NOT NULL REFERENCES genhal_kingdoms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  local_name TEXT,
  level TEXT NOT NULL DEFAULT 'primary',
  type TEXT NOT NULL DEFAULT 'public',
  founded INTEGER,
  address TEXT,
  image_url TEXT,
  website TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS genhal_kingdom_churches (
  id SERIAL PRIMARY KEY,
  kingdom_id INTEGER NOT NULL REFERENCES genhal_kingdoms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  local_name TEXT,
  type TEXT NOT NULL DEFAULT 'church',
  denomination TEXT,
  founded INTEGER,
  address TEXT,
  image_url TEXT,
  website TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kgd_languages_kingdom ON genhal_kingdom_languages(kingdom_id);
CREATE INDEX IF NOT EXISTS idx_kgd_geopoints_kingdom ON genhal_kingdom_geopoints(kingdom_id);
CREATE INDEX IF NOT EXISTS idx_kgd_economy_kingdom ON genhal_kingdom_economic_activities(kingdom_id);
CREATE INDEX IF NOT EXISTS idx_kgd_schools_kingdom ON genhal_kingdom_schools(kingdom_id);
CREATE INDEX IF NOT EXISTS idx_kgd_churches_kingdom ON genhal_kingdom_churches(kingdom_id);
