-- Migration: Birthday Messages Feature
-- Creates date_of_birth column, vendor_notifications table,
-- birthday_message_logs table, and idempotency indexes.
-- Applied: 2026-07-06

-- ── vendors: add date_of_birth ────────────────────────────────────────────────
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- ── vendor_notifications ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_notifications (
  id          SERIAL PRIMARY KEY,
  vendor_id   INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL,
  message     TEXT    NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One birthday notification per vendor per UTC calendar day.
-- Partial index on type='birthday' keeps other notification types unrestricted.
CREATE UNIQUE INDEX IF NOT EXISTS vendor_notifications_birthday_day_uniq
  ON vendor_notifications (vendor_id, DATE(created_at AT TIME ZONE 'UTC'))
  WHERE type = 'birthday';

-- ── birthday_message_logs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS birthday_message_logs (
  id           SERIAL PRIMARY KEY,
  vendor_id    INTEGER NOT NULL,
  vendor_name  TEXT    NOT NULL,
  vendor_email TEXT,
  channel      TEXT    NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One log row per vendor per channel per UTC calendar day.
-- Prevents duplicate log entries on process restarts inside the 08:00 UTC window.
CREATE UNIQUE INDEX IF NOT EXISTS birthday_logs_vendor_channel_day_uniq
  ON birthday_message_logs (vendor_id, channel, DATE(sent_at AT TIME ZONE 'UTC'));
