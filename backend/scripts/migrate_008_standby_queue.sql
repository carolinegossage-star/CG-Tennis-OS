-- Feature E: standby / waitlist auto-fill.
-- Additive only; no trial, Stripe, auth, or service-worker changes.

ALTER TABLE coach_profiles
  ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS session_standby_queue (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  queue_position  INTEGER NOT NULL,
  claim_token     UUID NOT NULL DEFAULT uuid_generate_v4(),
  notified_at     TIMESTAMPTZ,
  claimed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, player_id),
  UNIQUE(claim_token)
);

CREATE TABLE IF NOT EXISTS standby_notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  queue_id    UUID NOT NULL REFERENCES session_standby_queue(id) ON DELETE CASCADE,
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_standby_queue_session
  ON session_standby_queue(session_id, queue_position);
CREATE INDEX IF NOT EXISTS idx_standby_queue_open
  ON session_standby_queue(session_id, claimed_at, notified_at);
