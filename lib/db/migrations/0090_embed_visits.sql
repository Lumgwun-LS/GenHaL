-- Migration 0090: embed_visits table for storefront visit tracking

CREATE TABLE IF NOT EXISTS embed_visits (
  id              SERIAL PRIMARY KEY,
  vendor_id       INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  referrer_domain TEXT,
  session_id      TEXT,
  visited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS embed_visits_vendor_visited_at ON embed_visits(vendor_id, visited_at);
CREATE INDEX IF NOT EXISTS embed_visits_session            ON embed_visits(session_id);
