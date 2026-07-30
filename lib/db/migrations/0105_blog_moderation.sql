-- Blog commenter ban list (per-vendor)
CREATE TABLE IF NOT EXISTS "blog_commenter_bans" (
  "id"              serial PRIMARY KEY,
  "vendor_id"       integer NOT NULL,
  "commenter_email" text    NOT NULL,
  "reason"          text,
  "banned_at"       timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("vendor_id", "commenter_email")
);

-- Per-post global suspension (admin-only)
ALTER TABLE "blog_posts"
  ADD COLUMN IF NOT EXISTS "suspended_from_global" boolean NOT NULL DEFAULT false;

-- Per-vendor blog suspension (admin-only)
ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "blog_suspended" boolean NOT NULL DEFAULT false;
