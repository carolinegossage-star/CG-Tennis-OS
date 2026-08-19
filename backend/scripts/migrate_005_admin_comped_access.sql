-- Additive internal access flags.
-- These columns are set directly by trusted operators or a future internal tool.
-- No existing subscription, trial, or Stripe columns are modified.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_comped  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comped_plan TEXT;

CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = true;
CREATE INDEX IF NOT EXISTS idx_users_is_comped ON users(is_comped) WHERE is_comped = true;
