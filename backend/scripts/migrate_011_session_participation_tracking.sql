-- Session Participation Tracking: a structured attendance ledger linked to the shared Player Register.
-- This is additive. Existing sessions, including legacy player_id and player_group fields,
-- are retained and backfilled into participant rows without altering their session data.

CREATE TABLE IF NOT EXISTS session_participants (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id            UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id             UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  coach_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participation_status  VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                        CHECK (participation_status IN ('scheduled', 'attended', 'absent', 'excused')),
  attendance_note       TEXT,
  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_session_participants_player_activity
  ON session_participants(player_id, participation_status, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_participants_session
  ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_coach_status
  ON session_participants(coach_id, participation_status);

-- Backfill individual-session participants. Completed sessions are treated as attended;
-- cancelled sessions become excused; future and uncompleted sessions remain scheduled.
INSERT INTO session_participants (session_id, player_id, coach_id, participation_status)
SELECT
  s.id,
  s.player_id,
  s.coach_id,
  CASE
    WHEN s.cancelled_reason IS NOT NULL THEN 'excused'
    WHEN s.is_completed = true THEN 'attended'
    ELSE 'scheduled'
  END
FROM sessions s
WHERE s.player_id IS NOT NULL
ON CONFLICT (session_id, player_id) DO NOTHING;

-- Backfill group-session participants from the existing player_group array. This keeps
-- legacy group logs visible in player history and avoids losing prior activity.
INSERT INTO session_participants (session_id, player_id, coach_id, participation_status)
SELECT
  s.id,
  participant_id,
  s.coach_id,
  CASE
    WHEN s.cancelled_reason IS NOT NULL THEN 'excused'
    WHEN s.is_completed = true THEN 'attended'
    ELSE 'scheduled'
  END
FROM sessions s
CROSS JOIN LATERAL unnest(COALESCE(s.player_group, ARRAY[]::uuid[])) AS participant_id
ON CONFLICT (session_id, player_id) DO NOTHING;
