-- ============================================================
-- TENNIS COACHING OS — COMPLETE DATABASE SCHEMA
-- Run with: psql -U your_user -d tennis_coaching_os -f migrate.sql
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For full-text search

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('coach', 'academy_director', 'parent', 'player', 'federation_admin', 'super_admin');
CREATE TYPE entry_status AS ENUM ('pending', 'confirmed', 'withdrawn', 'waitlisted');
CREATE TYPE payment_status AS ENUM ('unpaid', 'paid', 'refunded', 'waived');
CREATE TYPE alert_severity AS ENUM ('urgent', 'warning', 'safe', 'info');
CREATE TYPE alert_type AS ENUM ('tournament_deadline', 'burnout_risk', 'dropout_risk', 'injury_risk', 'payment_due', 'session_overdue', 'parent_contact');
CREATE TYPE environment_type AS ENUM ('one_court', 'multi_court', 'rural', 'urban', 'low_budget', 'high_performance', 'school', 'club', 'academy', 'private');
CREATE TYPE surface_type AS ENUM ('clay', 'hard', 'grass', 'carpet', 'artificial_clay', 'indoor_hard');
CREATE TYPE checklist_type AS ENUM ('safeguarding', 'pre_session', 'injury_risk', 'competition_readiness', 'parent_protocol', 'coach_development');
CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE pricing_model AS ENUM ('per_session', 'monthly_retainer', 'annual_retainer', 'block_booking', 'group_rate', 'academy_fee');

-- ─── USERS ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email            VARCHAR(255) UNIQUE NOT NULL,
  password_hash    VARCHAR(255) NOT NULL,
  role             user_role NOT NULL DEFAULT 'coach',
  name             VARCHAR(255) NOT NULL,
  phone            VARCHAR(50),
  avatar_url       TEXT,
  language_pref    VARCHAR(10) NOT NULL DEFAULT 'en-GB',
  timezone         VARCHAR(100) NOT NULL DEFAULT 'Europe/London',
  email_verified   BOOLEAN NOT NULL DEFAULT false,
  email_verify_token VARCHAR(255),
  reset_token      VARCHAR(255),
  reset_token_expires TIMESTAMPTZ,
  refresh_token    TEXT,
  last_login_at    TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ─── COACH PROFILES ───────────────────────────────────────────────────────────

CREATE TABLE coach_profiles (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Coaching Identity
  archetype                VARCHAR(100),
  philosophy               TEXT,
  signature_style          TEXT,
  development_pathway_level VARCHAR(100),
  -- Environment & Context
  environment_types        environment_type[],
  years_experience         INTEGER,
  -- Certifications (array of objects stored as JSONB)
  certifications           JSONB DEFAULT '[]',
  -- Business
  pricing_model            pricing_model,
  hourly_rate              DECIMAL(10,2),
  monthly_target_revenue   DECIMAL(10,2),
  positioning_niche        TEXT,
  -- Metrics (calculated/cached)
  player_count             INTEGER DEFAULT 0,
  retention_rate           DECIMAL(5,2),
  avg_enjoyment_score      DECIMAL(3,2),
  -- Flags
  is_onboarded             BOOLEAN DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_coach_profiles_user_id ON coach_profiles(user_id);

-- ─── PLAYERS ──────────────────────────────────────────────────────────────────

CREATE TABLE players (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id              UUID REFERENCES users(id) ON DELETE SET NULL,
  academy_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  user_id               UUID REFERENCES users(id) ON DELETE SET NULL, -- if player has own login
  -- Identity
  name                  VARCHAR(255) NOT NULL,
  date_of_birth         DATE,
  gender                VARCHAR(20),
  nationality           VARCHAR(100),
  email                 VARCHAR(255),
  phone                 VARCHAR(50),
  parent_name           VARCHAR(255),
  parent_email          VARCHAR(255),
  parent_phone          VARCHAR(50),
  -- Rankings
  ranking_current       INTEGER,
  ranking_trajectory    JSONB DEFAULT '[]', -- [{date, ranking}]
  itf_id                VARCHAR(100),
  lta_id                VARCHAR(100),
  -- Milestones
  milestones            JSONB DEFAULT '[]', -- [{date, title, description}]
  -- Wellness & Risk
  enjoyment_score       DECIMAL(3,2) CHECK (enjoyment_score BETWEEN 0 AND 10),
  engagement_score      DECIMAL(3,2) CHECK (engagement_score BETWEEN 0 AND 10),
  burnout_risk_level    risk_level DEFAULT 'low',
  dropout_risk_level    risk_level DEFAULT 'low',
  -- Behavioural Markers (0-10 scores)
  confidence_score      DECIMAL(3,2),
  resilience_score      DECIMAL(3,2),
  communication_score   DECIMAL(3,2),
  leadership_score      DECIMAL(3,2),
  -- Status
  is_active             BOOLEAN DEFAULT true,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_players_coach_id ON players(coach_id);
CREATE INDEX idx_players_name ON players USING gin(name gin_trgm_ops);
CREATE INDEX idx_players_burnout ON players(burnout_risk_level) WHERE burnout_risk_level IN ('high','critical');
CREATE INDEX idx_players_dropout ON players(dropout_risk_level) WHERE dropout_risk_level IN ('high','critical');

-- ─── TOURNAMENTS ──────────────────────────────────────────────────────────────

CREATE TABLE tournaments (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                       VARCHAR(255) NOT NULL,
  organisation               VARCHAR(255), -- ITF, LTA, UTR, local club
  category                   VARCHAR(100), -- Grade 1, Grade 5, National, Regional etc.
  age_group                  VARCHAR(50),  -- U10, U12, U14, U16, U18, Adult, Open
  surface_type               surface_type,
  location_name              VARCHAR(255),
  location_country           VARCHAR(100) DEFAULT 'GBR',
  location_lat               DECIMAL(10,8),
  location_lng               DECIMAL(11,8),
  -- Dates
  start_date                 DATE NOT NULL,
  end_date                   DATE NOT NULL,
  entry_deadline             DATE,
  withdrawal_deadline        DATE,
  payment_deadline           DATE,
  -- Entry Details
  ranking_points_available   INTEGER,
  qualification_requirements TEXT,
  entry_fee                  DECIMAL(10,2),
  currency                   VARCHAR(3) DEFAULT 'GBP',
  registration_url           TEXT,
  draw_size                  INTEGER,
  -- Metadata
  is_verified                BOOLEAN DEFAULT false,
  source                     VARCHAR(100), -- 'LTA', 'ITF', 'manual', 'scraped'
  external_id                VARCHAR(255), -- ID from source system
  notes                      TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tournaments_start_date ON tournaments(start_date);
CREATE INDEX idx_tournaments_entry_deadline ON tournaments(entry_deadline);
CREATE INDEX idx_tournaments_age_group ON tournaments(age_group);
CREATE INDEX idx_tournaments_category ON tournaments(category);
CREATE INDEX idx_tournaments_name ON tournaments USING gin(name gin_trgm_ops);

-- ─── TOURNAMENT ENTRIES ───────────────────────────────────────────────────────

CREATE TABLE tournament_entries (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id           UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  tournament_id       UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  coach_id            UUID REFERENCES users(id),
  entry_status        entry_status NOT NULL DEFAULT 'pending',
  entry_date          TIMESTAMPTZ DEFAULT NOW(),
  payment_status      payment_status DEFAULT 'unpaid',
  payment_date        TIMESTAMPTZ,
  confirmation_number VARCHAR(100),
  withdrawal_reason   TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, tournament_id)
);

CREATE INDEX idx_entries_player_id ON tournament_entries(player_id);
CREATE INDEX idx_entries_tournament_id ON tournament_entries(tournament_id);
CREATE INDEX idx_entries_coach_id ON tournament_entries(coach_id);
CREATE INDEX idx_entries_status ON tournament_entries(entry_status);

-- ─── SESSIONS ─────────────────────────────────────────────────────────────────

CREATE TABLE sessions (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Players (single or group)
  player_id              UUID REFERENCES players(id),
  player_group           UUID[], -- array of player IDs for group sessions
  is_group_session       BOOLEAN DEFAULT false,
  -- Session Details
  session_date           DATE NOT NULL,
  start_time             TIME,
  duration_minutes       INTEGER,
  environment_type       environment_type,
  location               VARCHAR(255),
  -- Planning & Content
  session_plan           JSONB DEFAULT '{}', -- {objectives, drills, focus_areas, equipment}
  frameworks_used        TEXT[], -- ['TennisNLP', 'PlayingToExcel', 'TennisMindset']
  -- Post-Session
  reflection_text        TEXT,
  reflection_voice_url   TEXT,
  reflection_checklist   JSONB DEFAULT '{}',
  debrief_data           JSONB DEFAULT '{}', -- {what_went_well, improvements, player_response}
  marginal_gains_tracked JSONB DEFAULT '[]', -- [{area, before, after, notes}]
  ai_reflection_summary  TEXT,
  -- Scores recorded
  enjoyment_score        DECIMAL(3,2),
  engagement_score       DECIMAL(3,2),
  -- Status
  is_completed           BOOLEAN DEFAULT false,
  cancelled_reason       TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_coach_id ON sessions(coach_id);
CREATE INDEX idx_sessions_player_id ON sessions(player_id);
CREATE INDEX idx_sessions_date ON sessions(session_date DESC);

-- ─── RETENTION METRICS ────────────────────────────────────────────────────────

CREATE TABLE retention_metrics (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id             UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  coach_id              UUID NOT NULL REFERENCES users(id),
  recorded_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  enjoyment_score       DECIMAL(3,2) CHECK (enjoyment_score BETWEEN 0 AND 10),
  engagement_score      DECIMAL(3,2) CHECK (engagement_score BETWEEN 0 AND 10),
  attendance_rate       DECIMAL(5,2), -- percentage
  burnout_risk          risk_level,
  dropout_risk          risk_level,
  -- Risk Factors (JSONB for flexibility)
  risk_factors          JSONB DEFAULT '[]', -- [{factor, weight, value}]
  -- Intervention
  intervention_applied  TEXT,
  intervention_date     DATE,
  intervention_outcome  TEXT,
  -- Notes
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_retention_player_id ON retention_metrics(player_id);
CREATE INDEX idx_retention_coach_id ON retention_metrics(coach_id);
CREATE INDEX idx_retention_date ON retention_metrics(recorded_date DESC);

-- ─── BUSINESS METRICS ─────────────────────────────────────────────────────────

CREATE TABLE business_metrics (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start              DATE NOT NULL,
  period_end                DATE NOT NULL,
  -- Revenue
  revenue                   DECIMAL(10,2) DEFAULT 0,
  target_revenue            DECIMAL(10,2),
  -- Players
  player_count              INTEGER DEFAULT 0,
  new_players               INTEGER DEFAULT 0,
  churned_players           INTEGER DEFAULT 0,
  -- Rates
  retention_rate            DECIMAL(5,2),
  churn_rate                DECIMAL(5,2),
  -- Pricing
  pricing_model             pricing_model,
  avg_hourly_rate           DECIMAL(10,2),
  -- Experience
  customer_experience_score DECIMAL(3,2),
  nps_score                 INTEGER,
  -- Sessions
  sessions_delivered        INTEGER DEFAULT 0,
  sessions_cancelled        INTEGER DEFAULT 0,
  -- Notes
  positioning_niche         TEXT,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_business_metrics_coach_id ON business_metrics(coach_id);
CREATE INDEX idx_business_metrics_period ON business_metrics(period_start DESC);

-- ─── COMMUNITY KNOWLEDGE ──────────────────────────────────────────────────────

CREATE TABLE community_knowledge (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             VARCHAR(500) NOT NULL,
  content           TEXT NOT NULL,
  environment_type  environment_type[],
  resource_level    VARCHAR(50), -- 'low', 'medium', 'high'
  player_type       VARCHAR(100), -- 'beginner', 'intermediate', 'advanced', 'junior', 'adult'
  tags              TEXT[],
  -- Media
  voice_note_url    TEXT,
  image_urls        TEXT[],
  -- Language
  language          VARCHAR(10) DEFAULT 'en-GB',
  -- Engagement
  view_count        INTEGER DEFAULT 0,
  helpful_count     INTEGER DEFAULT 0,
  -- Status
  is_published      BOOLEAN DEFAULT true,
  is_featured       BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_coach_id ON community_knowledge(coach_id);
CREATE INDEX idx_community_environment ON community_knowledge USING gin(environment_type);
CREATE INDEX idx_community_tags ON community_knowledge USING gin(tags);
CREATE INDEX idx_community_search ON community_knowledge USING gin(
  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))
);

CREATE TABLE community_ratings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  knowledge_id UUID NOT NULL REFERENCES community_knowledge(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating       INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(knowledge_id, user_id)
);

-- ─── CHECKLISTS ───────────────────────────────────────────────────────────────

CREATE TABLE checklists (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id         UUID REFERENCES players(id) ON DELETE SET NULL,
  session_id        UUID REFERENCES sessions(id) ON DELETE SET NULL,
  checklist_type    checklist_type NOT NULL,
  title             VARCHAR(255),
  items             JSONB NOT NULL DEFAULT '[]', -- [{id, label, completed, completed_at, notes}]
  completion_status DECIMAL(5,2) DEFAULT 0, -- percentage
  completed_at      TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checklists_coach_id ON checklists(coach_id);
CREATE INDEX idx_checklists_type ON checklists(checklist_type);

-- ─── ALERTS ───────────────────────────────────────────────────────────────────

CREATE TABLE alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  related_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  related_tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
  alert_type      alert_type NOT NULL,
  severity        alert_severity NOT NULL DEFAULT 'info',
  title           VARCHAR(500) NOT NULL,
  message         TEXT NOT NULL,
  action_url      TEXT,
  action_label    VARCHAR(100),
  -- Metadata
  metadata        JSONB DEFAULT '{}', -- flexible extra data
  -- Status
  is_read         BOOLEAN DEFAULT false,
  read_at         TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES users(id),
  resolution_note TEXT,
  -- Scheduling
  send_at         TIMESTAMPTZ DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  sent_via        TEXT[], -- ['email', 'sms', 'push', 'in_app']
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_severity ON alerts(severity) WHERE resolved_at IS NULL;
CREATE INDEX idx_alerts_type ON alerts(alert_type);
CREATE INDEX idx_alerts_unread ON alerts(user_id, is_read) WHERE is_read = false;

-- ─── RULES ENGINE ─────────────────────────────────────────────────────────────

CREATE TABLE rules (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version       INTEGER NOT NULL DEFAULT 1,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  category      VARCHAR(100), -- 'tournament', 'burnout', 'dropout', 'pricing', 'session', 'parent'
  conditions    JSONB NOT NULL DEFAULT '{}', -- {field, operator, value} structures
  actions       JSONB NOT NULL DEFAULT '[]', -- [{type, target, payload}]
  priority      INTEGER DEFAULT 100,
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rules_category ON rules(category) WHERE is_active = true;
CREATE INDEX idx_rules_version ON rules(version DESC);

-- ─── WORKFLOWS ────────────────────────────────────────────────────────────────

CREATE TABLE workflows (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version      INTEGER NOT NULL DEFAULT 1,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  category     VARCHAR(100),
  steps        JSONB NOT NULL DEFAULT '[]', -- [{id, name, type, config, next}]
  inputs       JSONB DEFAULT '{}',
  outputs      JSONB DEFAULT '{}',
  is_active    BOOLEAN DEFAULT true,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AI ASSIST LOGS ───────────────────────────────────────────────────────────

CREATE TABLE ai_assist_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query        TEXT NOT NULL,
  response     TEXT,
  context      JSONB DEFAULT '{}', -- what data was included in the prompt
  tokens_used  INTEGER,
  model        VARCHAR(100),
  latency_ms   INTEGER,
  was_helpful  BOOLEAN, -- user feedback
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_logs_user_id ON ai_assist_logs(user_id);
CREATE INDEX idx_ai_logs_created_at ON ai_assist_logs(created_at DESC);

-- ─── AUDIT LOGS ───────────────────────────────────────────────────────────────

CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action          VARCHAR(255) NOT NULL,
  resource_type   VARCHAR(100),
  resource_id     UUID,
  rule_version    INTEGER,
  workflow_version INTEGER,
  inputs          JSONB DEFAULT '{}',
  outputs         JSONB DEFAULT '{}',
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);

-- ─── UPDATED_AT TRIGGER ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_coach_profiles_updated_at BEFORE UPDATE ON coach_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_players_updated_at BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tournaments_updated_at BEFORE UPDATE ON tournaments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_entries_updated_at BEFORE UPDATE ON tournament_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sessions_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_checklists_updated_at BEFORE UPDATE ON checklists FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_community_updated_at BEFORE UPDATE ON community_knowledge FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rules_updated_at BEFORE UPDATE ON rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_workflows_updated_at BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── SEED DEFAULT RULES ───────────────────────────────────────────────────────

INSERT INTO rules (name, description, category, conditions, actions, priority) VALUES
(
  'Tournament Entry Deadline — 7 Days Warning',
  'Alert coach when a tournament entry deadline is within 7 days',
  'tournament',
  '{"field": "days_until_entry_deadline", "operator": "lte", "value": 7}',
  '[{"type": "create_alert", "severity": "warning", "template": "tournament_deadline_7days"}]',
  10
),
(
  'Tournament Entry Deadline — 48 Hours Urgent',
  'Urgent alert when entry deadline is within 48 hours',
  'tournament',
  '{"field": "days_until_entry_deadline", "operator": "lte", "value": 2}',
  '[{"type": "create_alert", "severity": "urgent", "template": "tournament_deadline_urgent"}, {"type": "send_email", "template": "deadline_urgent"}]',
  1
),
(
  'Burnout Risk — High Engagement Drop',
  'Flag burnout risk when enjoyment score drops below 5 for 2+ consecutive sessions',
  'burnout',
  '{"field": "enjoyment_score_avg_last_3", "operator": "lt", "value": 5, "consecutive": 2}',
  '[{"type": "set_risk_level", "target": "player", "field": "burnout_risk_level", "value": "high"}, {"type": "create_alert", "severity": "warning", "template": "burnout_risk_detected"}]',
  20
),
(
  'Dropout Risk — Attendance Drop',
  'Flag dropout risk when player misses 3+ sessions in a month',
  'dropout',
  '{"field": "sessions_missed_last_30_days", "operator": "gte", "value": 3}',
  '[{"type": "set_risk_level", "target": "player", "field": "dropout_risk_level", "value": "high"}, {"type": "create_alert", "severity": "warning", "template": "dropout_risk_detected"}]',
  20
),
(
  'Dropout Risk — Critical No Contact',
  'Critical alert when player has had no session in 21+ days without explanation',
  'dropout',
  '{"field": "days_since_last_session", "operator": "gte", "value": 21}',
  '[{"type": "set_risk_level", "target": "player", "field": "dropout_risk_level", "value": "critical"}, {"type": "create_alert", "severity": "urgent", "template": "dropout_risk_critical"}, {"type": "create_alert", "alert_type": "parent_contact", "severity": "warning"}]',
  5
);

-- ─── SEED DEFAULT WORKFLOWS ───────────────────────────────────────────────────

INSERT INTO workflows (name, description, category, steps) VALUES
(
  'Session Review Workflow',
  'Standard post-session reflection and debrief process',
  'session',
  '[
    {"id": "1", "name": "Record Enjoyment Score", "type": "data_input", "field": "enjoyment_score"},
    {"id": "2", "name": "Record Engagement Score", "type": "data_input", "field": "engagement_score"},
    {"id": "3", "name": "Log Reflection", "type": "reflection_input", "modes": ["voice", "text", "checklist"]},
    {"id": "4", "name": "Log Marginal Gains", "type": "data_input", "field": "marginal_gains_tracked"},
    {"id": "5", "name": "Generate AI Summary", "type": "ai_action", "service": "reflective_practice"},
    {"id": "6", "name": "Update Retention Metrics", "type": "system_action", "service": "retention_intelligence"},
    {"id": "7", "name": "Check Risk Levels", "type": "rules_evaluation", "category": "burnout,dropout"},
    {"id": "8", "name": "Schedule Next Session", "type": "calendar_action"}
  ]'
),
(
  'Tournament Tracking Workflow',
  'Full lifecycle management for tournament entries',
  'tournament',
  '[
    {"id": "1", "name": "Identify Eligible Tournaments", "type": "query", "service": "tournament_deadline"},
    {"id": "2", "name": "Check Player Ranking Eligibility", "type": "rules_evaluation"},
    {"id": "3", "name": "Submit Entry", "type": "user_action"},
    {"id": "4", "name": "Confirm Payment", "type": "user_action"},
    {"id": "5", "name": "Set Deadline Alerts", "type": "system_action"},
    {"id": "6", "name": "Competition Readiness Check", "type": "checklist", "template": "competition_readiness"},
    {"id": "7", "name": "Post-Tournament Debrief", "type": "reflection_input"}
  ]'
),
(
  'Retention Check Workflow',
  'Proactive player retention monitoring and intervention',
  'retention',
  '[
    {"id": "1", "name": "Analyse Enjoyment Trends", "type": "analysis", "window_days": 30},
    {"id": "2", "name": "Analyse Attendance Patterns", "type": "analysis", "window_days": 30},
    {"id": "3", "name": "Evaluate Burnout Rules", "type": "rules_evaluation", "category": "burnout"},
    {"id": "4", "name": "Evaluate Dropout Rules", "type": "rules_evaluation", "category": "dropout"},
    {"id": "5", "name": "Generate Intervention Recommendation", "type": "ai_action"},
    {"id": "6", "name": "Create Coach Alert", "type": "system_action"},
    {"id": "7", "name": "Log Intervention", "type": "data_input"},
    {"id": "8", "name": "Schedule Follow-up", "type": "calendar_action", "days_ahead": 7}
  ]'
);

-- ─── SEED DEFAULT CHECKLIST TEMPLATES ─────────────────────────────────────────

INSERT INTO checklists (coach_id, checklist_type, title, items)
SELECT
  (SELECT id FROM users WHERE role = 'super_admin' LIMIT 1),
  'competition_readiness',
  'Competition Readiness — Standard',
  '[
    {"id": "cr1", "label": "Rackets strung and packed (at least 2)", "completed": false},
    {"id": "cr2", "label": "Tournament registration confirmed", "completed": false},
    {"id": "cr3", "label": "Travel and accommodation arranged", "completed": false},
    {"id": "cr4", "label": "Match schedule reviewed", "completed": false},
    {"id": "cr5", "label": "Warm-up routine agreed with player", "completed": false},
    {"id": "cr6", "label": "Mental preparation discussion completed", "completed": false},
    {"id": "cr7", "label": "Nutrition and hydration plan in place", "completed": false},
    {"id": "cr8", "label": "Parent briefing completed", "completed": false},
    {"id": "cr9", "label": "Emergency contacts confirmed", "completed": false},
    {"id": "cr10", "label": "Medical/first aid bag packed", "completed": false}
  ]'
WHERE EXISTS (SELECT 1 FROM users WHERE role = 'super_admin');

COMMENT ON DATABASE tennis_coaching_os IS 'Tennis Coaching OS — Built by CG Tennis Academies';
