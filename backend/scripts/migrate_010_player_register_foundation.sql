-- Player Register foundation: enrolment is a distinct, coach-visible lifecycle date.
-- Existing player records are backfilled from their immutable creation timestamp.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS enrolment_date DATE;

UPDATE players
SET enrolment_date = created_at::date
WHERE enrolment_date IS NULL;

ALTER TABLE players
  ALTER COLUMN enrolment_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN enrolment_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_players_coach_enrolment_date
  ON players(coach_id, enrolment_date DESC);
