-- Coaching Programmes: structured, coach-owned scheduling data.
-- This migration is additive. Existing players and sessions remain valid and keep
-- their current session_plan.session_type / is_group_session values unchanged.

CREATE TABLE IF NOT EXISTS coaching_programmes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  programme_type      VARCHAR(20) NOT NULL CHECK (programme_type IN ('individual', 'group', 'pair')),
  days_of_week        SMALLINT[] NOT NULL DEFAULT '{}',
  start_time          TIME,
  duration_minutes    INTEGER CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 15 AND 480),
  location            VARCHAR(255),
  capacity            INTEGER CHECK (capacity IS NULL OR capacity >= 1),
  notes               TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coaching_programmes_days_of_week_valid CHECK (
    COALESCE(days_of_week, '{}') <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::SMALLINT[]
  )
);

CREATE INDEX IF NOT EXISTS idx_coaching_programmes_coach_active
  ON coaching_programmes(coach_id, is_active);

CREATE TABLE IF NOT EXISTS player_programmes (
  player_id           UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  programme_id        UUID NOT NULL REFERENCES coaching_programmes(id) ON DELETE CASCADE,
  coach_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  assigned_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, programme_id)
);

CREATE INDEX IF NOT EXISTS idx_player_programmes_programme_active
  ON player_programmes(programme_id, is_active);
CREATE INDEX IF NOT EXISTS idx_player_programmes_player_active
  ON player_programmes(player_id, is_active);

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS programme_id UUID REFERENCES coaching_programmes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_programme_id
  ON sessions(programme_id);

-- Existing session rows intentionally retain a NULL programme_id. Their original
-- session_plan JSON and is_group_session flag remain the compatibility source.
