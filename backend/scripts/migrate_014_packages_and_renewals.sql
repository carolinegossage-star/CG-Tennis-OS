-- Packages and Renewals: structured enrolment tracking only.
-- This migration intentionally does not process payment, modify manual income records,
-- or resolve/apply Session Credit. Coaches decide any financial action manually.

CREATE TABLE IF NOT EXISTS coaching_packages (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  programme_id          UUID REFERENCES coaching_programmes(id) ON DELETE SET NULL,
  name                  VARCHAR(255) NOT NULL,
  duration_days         INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 730),
  price_reference       DECIMAL(10,2) CHECK (price_reference IS NULL OR price_reference >= 0),
  sessions_included     INTEGER CHECK (sessions_included IS NULL OR sessions_included >= 1),
  description           TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coaching_packages_coach_active
  ON coaching_packages(coach_id, is_active);
CREATE INDEX IF NOT EXISTS idx_coaching_packages_programme
  ON coaching_packages(programme_id);

CREATE TABLE IF NOT EXISTS player_package_enrolments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id             UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  package_id            UUID REFERENCES coaching_packages(id) ON DELETE SET NULL,
  programme_id          UUID REFERENCES coaching_programmes(id) ON DELETE SET NULL,
  package_name          VARCHAR(255) NOT NULL,
  programme_name        VARCHAR(255),
  duration_days         INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 730),
  price_reference       DECIMAL(10,2) CHECK (price_reference IS NULL OR price_reference >= 0),
  sessions_included     INTEGER CHECK (sessions_included IS NULL OR sessions_included >= 1),
  start_date            DATE NOT NULL,
  renewal_date          DATE NOT NULL,
  status                VARCHAR(24) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'renewal_due', 'renewed', 'expired', 'cancelled', 'superseded')),
  notes                 TEXT,
  renewed_from_id       UUID REFERENCES player_package_enrolments(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT player_package_enrolments_date_order CHECK (renewal_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_player_package_enrolments_coach_renewal
  ON player_package_enrolments(coach_id, renewal_date, status);
CREATE INDEX IF NOT EXISTS idx_player_package_enrolments_player
  ON player_package_enrolments(player_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_player_package_enrolments_active
  ON player_package_enrolments(coach_id, player_id)
  WHERE status IN ('active', 'renewal_due');
