ALTER TABLE store_developer_accounts ADD COLUMN IF NOT EXISTS fee_exempt boolean NOT NULL DEFAULT false;
