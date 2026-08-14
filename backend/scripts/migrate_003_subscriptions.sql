-- ─── SUBSCRIPTION / STRIPE COLUMNS ────────────────────────────────────────────
-- These four columns ALREADY EXIST on the production database (added
-- out-of-band before this file was written). This migration exists so the
-- repository can rebuild the live schema from scratch — for a staging
-- environment or disaster recovery — rather than silently depending on
-- manual SQL that is not in version control.
--
-- Running this against production is a NO-OP: every clause is guarded by
-- IF NOT EXISTS, and the backfill only touches rows where the value is
-- still NULL. It does not read, write, or reference any trial_* column.
--
-- Run AFTER migrate.sql and migrate_002_trial_activation.sql.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS subscription_plan      VARCHAR(50) DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS subscription_status    VARCHAR(50) DEFAULT 'trialing';

-- subscription_plan:   'starter' | 'professional' | 'academy'
--   Academy is contact-sales only and is never set by Stripe Checkout; it is
--   applied manually via PATCH /admin/access/users/:id, as is the privately
--   invited Founding Cohort rate.
-- subscription_status: 'trialing' | 'active' | 'restricted' | 'canceled' | 'past_due'

-- Looked up on every Stripe webhook, which resolves users by customer ID.
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id
  ON users(stripe_customer_id);

-- Backfill defaults for any row that predates the columns.
UPDATE users
   SET subscription_plan = 'starter'
 WHERE subscription_plan IS NULL;

UPDATE users
   SET subscription_status = 'trialing'
 WHERE subscription_status IS NULL;
