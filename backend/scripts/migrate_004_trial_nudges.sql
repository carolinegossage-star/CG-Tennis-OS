-- ─── TRIAL NUDGE DEDUPLICATION ────────────────────────────────────────────────
-- Existing trial_nudge_sent_at continues to guard the day-10 milestone nudge.
-- These separate timestamps make the new day-7 and day-13 messages idempotent
-- without changing the existing trial extension logic.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trial_day7_nudge_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_day13_nudge_sent_at TIMESTAMPTZ;
