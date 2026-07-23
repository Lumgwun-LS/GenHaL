-- Identifiers that may never be re-registered after account deletion
CREATE TABLE IF NOT EXISTS banned_identifiers (
  id        serial PRIMARY KEY,
  email     text,
  phone     text,
  reason    text NOT NULL DEFAULT 'account_deleted',
  banned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS banned_identifiers_email_idx ON banned_identifiers (lower(email));
CREATE INDEX IF NOT EXISTS banned_identifiers_phone_idx ON banned_identifiers (phone);
