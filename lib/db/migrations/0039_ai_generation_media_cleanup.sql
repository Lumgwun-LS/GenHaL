-- Tracks when the media-cleanup job deleted a generation's underlying object
-- storage file (image/video only). `result` stays intact as an audit trail;
-- only the object itself is removed once it's aged out unattached to any post.
ALTER TABLE ai_generations ADD COLUMN IF NOT EXISTS media_deleted_at timestamptz;
-- Bumped on every sweep-tick examination (deleted or skipped-as-still-used),
-- so batching can round-robin oldest-checked-first instead of starving on a
-- backlog of permanently-in-use rows.
ALTER TABLE ai_generations ADD COLUMN IF NOT EXISTS media_last_checked_at timestamptz;
