-- Will recovery system: executor recovery codes + platform admin escrow.
--
-- Adds a "split-key" encryption scheme alongside the existing "passphrase"
-- scheme (existing wills are unaffected; new wills with executors use this).
--
-- Three key envelopes are stored for new wills:
--   1. Owner envelope  — content key wrapped with owner's passphrase (PBKDF2)
--   2. Recovery envelope — content key wrapped with recovery code (PBKDF2)
--   3. Platform envelope — content key wrapped with WILL_PLATFORM_MASTER_KEY (AES-GCM)
--
-- The recovery code is emailed to each named executor at creation time.
-- The platform envelope is the last resort: an admin must approve an unlock
-- request (with death certificate) before anyone can use it.

ALTER TABLE genhal_family_wills
  -- Scheme: 'passphrase' (existing) | 'split-key' (new)
  ADD COLUMN IF NOT EXISTS content_key_scheme       TEXT NOT NULL DEFAULT 'passphrase',

  -- Named executors [{name, email}]
  ADD COLUMN IF NOT EXISTS executors                TEXT NOT NULL DEFAULT '[]',

  -- Owner key envelope (JSON {encrypted, iv, salt, authTag})
  -- Content key wrapped with owner passphrase via PBKDF2
  ADD COLUMN IF NOT EXISTS owner_key_envelope       TEXT,

  -- Recovery key envelope (JSON {encrypted, iv, salt, authTag})
  -- Content key wrapped with recovery code via PBKDF2
  ADD COLUMN IF NOT EXISTS recovery_key_envelope    TEXT,

  -- Platform escrow key envelope (JSON {encrypted, iv, authTag})
  -- Content key wrapped with WILL_PLATFORM_MASTER_KEY
  ADD COLUMN IF NOT EXISTS platform_key_envelope    TEXT,

  -- Admin unlock workflow
  ADD COLUMN IF NOT EXISTS death_cert_url           TEXT,
  ADD COLUMN IF NOT EXISTS death_cert_submitted_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS death_cert_submitted_by  TEXT,   -- clerk user id
  ADD COLUMN IF NOT EXISTS admin_escrow_granted_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS admin_escrow_granted_by  TEXT,   -- admin clerk user id
  ADD COLUMN IF NOT EXISTS admin_escrow_for_clerk   TEXT;   -- who may use the escrow path
