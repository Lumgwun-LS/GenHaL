-- Track the voice-minute quota reservation made at call-placement time, and
-- the exact billing period it was reserved against, so status-callback
-- settlement can always refund the unused portion against the correct
-- period even if the vendor's rolling period has since rolled over.
ALTER TABLE voice_call_logs ADD COLUMN IF NOT EXISTS reserved_minutes numeric;
ALTER TABLE voice_call_logs ADD COLUMN IF NOT EXISTS reserved_period_start timestamptz;
