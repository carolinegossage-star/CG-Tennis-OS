-- Feature B: parent progress-update drafts.
-- Additive only; does not alter trial, Stripe, auth, or service-worker data.

ALTER TABLE coach_profiles
  ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS parent_drafts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id         UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  coach_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_encrypted BYTEA NOT NULL,
  iv                BYTEA NOT NULL,
  auth_tag          BYTEA NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at       TIMESTAMPTZ,
  purge_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS parent_draft_audit_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_id    UUID NOT NULL,
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  coach_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  VARCHAR(20) NOT NULL CHECK (event_type IN ('created', 'approved', 'deleted', 'purged', 'archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parent_drafts_pending_purge
  ON parent_drafts(status, purge_at);
CREATE INDEX IF NOT EXISTS idx_parent_drafts_player
  ON parent_drafts(player_id, coach_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_draft_audit_draft
  ON parent_draft_audit_events(draft_id, created_at);

CREATE OR REPLACE FUNCTION purge_pending_parent_drafts_on_archive()
RETURNS trigger AS $$
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    INSERT INTO parent_draft_audit_events (draft_id, player_id, coach_id, event_type)
      SELECT id, player_id, coach_id, 'archived'
        FROM parent_drafts
       WHERE player_id = NEW.id AND status = 'pending';
    DELETE FROM parent_drafts WHERE player_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_purge_pending_parent_drafts_on_archive ON players;
CREATE TRIGGER trg_purge_pending_parent_drafts_on_archive
  AFTER UPDATE OF is_active ON players
  FOR EACH ROW EXECUTE FUNCTION purge_pending_parent_drafts_on_archive();
