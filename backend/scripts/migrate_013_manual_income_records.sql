-- Manual Income Recording: coach bookkeeping only.
-- These records document money a coach has already received. They do not initiate,
-- collect, refund, deduct, invoice, or otherwise process any payment.

CREATE TABLE IF NOT EXISTS income_records (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id        UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  amount           DECIMAL(10,2) NOT NULL CHECK (amount > 0 AND amount <= 1000000),
  received_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  received_via     VARCHAR(30) NOT NULL DEFAULT 'bank_transfer'
                   CHECK (received_via IN ('bank_transfer', 'cash', 'card_reader', 'cheque', 'other')),
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_income_records_coach_date
  ON income_records(coach_id, received_date DESC);
CREATE INDEX IF NOT EXISTS idx_income_records_player_date
  ON income_records(player_id, received_date DESC);
