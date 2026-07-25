-- Add per-vendor auto-deduction threshold.
-- NULL means "use the platform-default ladder[0] from billing.deductionLadder site-content".
-- After each successful threshold charge the scheduler advances this to the next rung.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS current_deduction_threshold numeric;
