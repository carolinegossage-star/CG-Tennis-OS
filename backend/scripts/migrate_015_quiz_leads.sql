-- Coach Operating Readiness Index™ lead capture only.
-- This migration is additive: it does not alter existing product tables or
-- application behaviour. The linked user is optional and used for visibility.

CREATE TABLE IF NOT EXISTS quiz_leads (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                     VARCHAR(255) NOT NULL,
  email                    VARCHAR(255) NOT NULL,
  coaching_role            VARCHAR(50) NOT NULL
                           CHECK (coaching_role IN ('independent', 'academy', 'other')),
  answers                  JSONB NOT NULL,
  dimension_scores         JSONB NOT NULL,
  overall_score            INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  operating_stage          VARCHAR(50) NOT NULL
                           CHECK (operating_stage IN ('reactive', 'capable', 'structured', 'coherent', 'scalable')),
  biggest_opportunity      VARCHAR(50) NOT NULL
                           CHECK (biggest_opportunity IN ('coaching_clarity', 'player_continuity', 'operational_control', 'business_visibility', 'reflective_practice', 'future_readiness')),
  marketing_consent        BOOLEAN NOT NULL DEFAULT false,
  teaser_email_sent_at     TIMESTAMPTZ,
  matched_user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  matched_at               TIMESTAMPTZ,
  report_sent_manually_at  TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_leads_email
  ON quiz_leads(email);

CREATE INDEX IF NOT EXISTS idx_quiz_leads_matched_user
  ON quiz_leads(matched_user_id)
  WHERE matched_user_id IS NOT NULL;
