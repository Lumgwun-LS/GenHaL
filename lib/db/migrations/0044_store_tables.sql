-- Awajimaa App Store tables

CREATE TABLE IF NOT EXISTS store_developer_accounts (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT,
  website TEXT,
  company TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  registration_fee_paid BOOLEAN NOT NULL DEFAULT FALSE,
  payment_gateway TEXT,
  payment_ref TEXT,
  stripe_payment_intent_id TEXT,
  paystack_reference TEXT,
  paypal_order_id TEXT,
  suspension_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_apps (
  id SERIAL PRIMARY KEY,
  developer_id INTEGER NOT NULL REFERENCES store_developer_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  tagline TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'android',
  icon_url TEXT NOT NULL,
  screenshots JSONB NOT NULL DEFAULT '[]',
  download_url TEXT,
  web_url TEXT,
  current_version TEXT,
  total_downloads INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by_clerk_id TEXT,
  reviewed_at TIMESTAMP,
  rejection_reason TEXT,
  ai_summary TEXT,
  ai_category TEXT,
  ai_policy_flags TEXT,
  ai_review_score REAL,
  ai_reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_app_versions (
  id SERIAL PRIMARY KEY,
  app_id INTEGER NOT NULL REFERENCES store_apps(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  release_notes TEXT,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_app_reviews (
  id SERIAL PRIMARY KEY,
  app_id INTEGER NOT NULL REFERENCES store_apps(id) ON DELETE CASCADE,
  reviewer_clerk_id TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  sentiment_score REAL,
  sentiment_label TEXT,
  is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  flag_reason TEXT,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_apps_status ON store_apps(status);
CREATE INDEX IF NOT EXISTS idx_store_apps_category ON store_apps(category);
CREATE INDEX IF NOT EXISTS idx_store_apps_developer_id ON store_apps(developer_id);
CREATE INDEX IF NOT EXISTS idx_store_app_reviews_app_id ON store_app_reviews(app_id);
CREATE INDEX IF NOT EXISTS idx_store_app_versions_app_id ON store_app_versions(app_id);
