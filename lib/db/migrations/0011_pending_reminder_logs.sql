-- Tracks sent "pending item" reminder emails (posts stuck past schedule, payments stuck pending)
-- so each pending item triggers at most one reminder rather than one per job tick.
CREATE TABLE IF NOT EXISTS pending_reminder_logs (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pending_reminder_logs_item_uniq UNIQUE (item_type, item_id)
);
