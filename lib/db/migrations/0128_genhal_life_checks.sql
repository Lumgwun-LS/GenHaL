-- Proof-of-life checks for GenHaL family accounts
CREATE TABLE IF NOT EXISTS genhal_life_checks (
  id               SERIAL PRIMARY KEY,
  family_id        INTEGER NOT NULL REFERENCES genhal_family_accounts(id) ON DELETE CASCADE,
  token            TEXT    NOT NULL UNIQUE,
  sent_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  responded_at     TIMESTAMP,
  expires_at       TIMESTAMP NOT NULL,
  sequence         INTEGER NOT NULL DEFAULT 1,
  nok_notified_at  TIMESTAMP,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS genhal_life_checks_family_sent
  ON genhal_life_checks (family_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS genhal_life_checks_token
  ON genhal_life_checks (token);
