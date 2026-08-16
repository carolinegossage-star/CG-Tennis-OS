-- ─── SUBSCRIPTION / STRIPE COLUMNS ────────────────────────────────────────────
-- Idempotent and safe against the live database. Existing subscription columns
-- are preserved; legacy starter values are normalized to solo.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS subscription_plan      VARCHAR(50) DEFAULT 'solo',
  ADD COLUMN IF NOT EXISTS subscription_status    VARCHAR(50) DEFAULT 'trialing';

ALTER TABLE users ALTER COLUMN subscription_plan SET DEFAULT 'solo';
UPDATE users SET subscription_plan = 'solo' WHERE subscription_plan = 'starter';

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);

UPDATE users SET subscription_plan = 'solo' WHERE subscription_plan IS NULL;
UPDATE users SET subscription_status = 'trialing' WHERE subscription_status IS NULL;
