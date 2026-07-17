-- Add addon_allocations column to voice_call_logs so the voice-status-callback
-- can restore consumed add-on credits on partial release (unused reservation refund).
-- Stores JSON: Array<{id: number; amount: number}> — the add-on credit rows
-- consumed during the call's quota reservation, captured at reservation time.
ALTER TABLE voice_call_logs
  ADD COLUMN IF NOT EXISTS reserved_addon_allocations jsonb;
