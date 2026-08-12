-- ─── TRIAL ACTIVATION ──────────────────────────────────────────────────────────
-- Adds trial tracking fields to users and a log table for nudge/extension events.
-- Run this AFTER migrate.sql. Safe to run once; re-running is guarded by IF NOT EXISTS.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trial_started_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_expires_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_extended      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_nudge_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_status        VARCHAR(20) NOT NULL DEFAULT 'active';
  -- trial_status: 'active' | 'extended' | 'expired' | 'converted'

CREATE INDEX IF NOT EXISTS idx_users_trial_expires_at ON users(trial_expires_at);

-- Set trial_started_at / trial_expires_at for anyone who signed up before this
-- migration ran but doesn't have it set yet, so nothing falls through the cracks.
UPDATE users
SET trial_started_at = created_at,
    trial_expires_at  = created_at + INTERVAL '14 days'
WHERE role = 'coach' AND trial_started_at IS NULL;

-- Simple audit trail of trial events (nudge sent, extension granted, expired, converted)
CREATE TABLE IF NOT EXISTS trial_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  VARCHAR(30) NOT NULL, -- 'nudge_sent' | 'extended' | 'expired' | 'converted'
  detail      JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trial_events_user_id ON trial_events(user_id);
