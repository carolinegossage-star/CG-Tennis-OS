-- Session Credit Ledger: time owed to a player, separate from session attendance.
-- This ledger never changes participation_status, retention metrics, payments, Stripe, or billing.

CREATE TABLE IF NOT EXISTS session_credits (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id                UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  session_id               UUID REFERENCES sessions(id) ON DELETE SET NULL,
  credit_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  credit_minutes           INTEGER NOT NULL CHECK (credit_minutes > 0 AND credit_minutes <= 480),
  planned_duration_minutes INTEGER CHECK (planned_duration_minutes > 0 AND planned_duration_minutes <= 480),
  actual_duration_minutes  INTEGER CHECK (actual_duration_minutes >= 0 AND actual_duration_minutes <= 480),
  credit_reason            VARCHAR(40) NOT NULL DEFAULT 'other'
                           CHECK (credit_reason IN ('weather', 'coach_cancellation', 'facility_closure', 'shortened_session', 'other')),
  note                     TEXT,
  is_resolved              BOOLEAN NOT NULL DEFAULT false,
  resolved_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    actual_duration_minutes IS NULL
    OR planned_duration_minutes IS NULL
    OR actual_duration_minutes <= planned_duration_minutes
  )
);

-- One player can receive one time-credit entry per session. Standalone manual time-credit
-- entries remain possible by leaving session_id null.
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_credits_unique_session_player
  ON session_credits(session_id, player_id)
  WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_session_credits_player_open_balance
  ON session_credits(player_id, is_resolved, credit_date DESC);
CREATE INDEX IF NOT EXISTS idx_session_credits_coach_open_balance
  ON session_credits(coach_id, is_resolved, credit_date DESC);
