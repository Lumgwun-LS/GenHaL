-- Migration: Voice Call Agent
-- Adds voice call opt-out to vendors, creates voice_call_logs,
-- voice_campaigns, and voice_campaign_calls tables.
-- Applied: 2026-07-07

-- ── vendors: voice opt-out ────────────────────────────────────────────────────
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS voice_call_opt_out BOOLEAN NOT NULL DEFAULT FALSE;

-- ── voice_call_logs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_call_logs (
  id               SERIAL PRIMARY KEY,
  vendor_id        INTEGER,
  campaign_id      INTEGER,
  phone            TEXT        NOT NULL,
  direction        TEXT        NOT NULL DEFAULT 'outbound',
  purpose          TEXT        NOT NULL,           -- 'birthday' | 'campaign'
  status           TEXT        NOT NULL DEFAULT 'queued',
  duration_seconds INTEGER,
  call_sid         TEXT,
  initiated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── voice_campaigns ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_campaigns (
  id           SERIAL PRIMARY KEY,
  vendor_id    INTEGER     NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  script       TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One birthday call per vendor per UTC calendar day (prevents double-call on restart)
CREATE UNIQUE INDEX IF NOT EXISTS voice_call_logs_birthday_day_uniq
  ON voice_call_logs (vendor_id, DATE(initiated_at AT TIME ZONE 'UTC'))
  WHERE purpose = 'birthday';

-- ── voice_campaign_calls ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_campaign_calls (
  id               SERIAL PRIMARY KEY,
  campaign_id      INTEGER NOT NULL REFERENCES voice_campaigns(id) ON DELETE CASCADE,
  lead_id          INTEGER,
  lead_name        TEXT    NOT NULL,
  phone            TEXT    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'queued',
  duration_seconds INTEGER,
  call_sid         TEXT,
  initiated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
