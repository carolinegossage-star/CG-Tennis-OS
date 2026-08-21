-- Feature A foundation: retention-risk early warning.
-- Additive only; does not alter trial, Stripe, auth, or service-worker data.

ALTER TABLE coach_profiles
  ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS retention_flags (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id          UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  coach_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flag_reason        VARCHAR(255) NOT NULL,
  context            JSONB NOT NULL DEFAULT '{}'::jsonb,
  flagged_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_until    TIMESTAMPTZ,
  resolved_at        TIMESTAMPTZ,
  resolved_by_coach  BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_retention_flags_coach_active
  ON retention_flags(coach_id, resolved_at, flagged_at DESC);
CREATE INDEX IF NOT EXISTS idx_retention_flags_player_active
  ON retention_flags(player_id, resolved_at);
