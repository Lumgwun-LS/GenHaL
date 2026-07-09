-- Migration: Site Content (no-code admin "Site Editor")
-- Generic key/value store for admin-editable marketing copy, pricing text,
-- site settings, and email templates. Missing keys fall back to hardcoded
-- defaults, so the app always renders even before an admin edits anything.
-- Applied: 2026-07-09

CREATE TABLE IF NOT EXISTS site_content (
  key         TEXT PRIMARY KEY,
  value       JSONB       NOT NULL,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
