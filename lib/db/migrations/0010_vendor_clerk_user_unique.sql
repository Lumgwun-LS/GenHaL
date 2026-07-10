-- Prevent duplicate vendor rows for the same Clerk user (e.g. onboarding submitted twice).
-- Partial index because clerk_user_id is nullable (vendors created via admin/API may have none).
CREATE UNIQUE INDEX IF NOT EXISTS vendors_clerk_user_id_unique
  ON vendors (clerk_user_id)
  WHERE clerk_user_id IS NOT NULL;
