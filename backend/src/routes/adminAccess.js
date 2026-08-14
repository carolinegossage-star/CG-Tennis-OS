/**
 * Admin Access Control Routes
 * ---------------------------------------------------------------
 * Lets a super_admin grant or restrict a coach's access level
 * (subscription_plan / subscription_status) without raw SQL. This is the
 * mechanism for the two tiers that are deliberately NOT sold through
 * Stripe Checkout: Academy (contact-sales) and the privately-invited
 * Founding Cohort rate.
 *
 * Additive only: no existing route, table, or trial logic is modified.
 * Nothing here reads or writes any trial_* column — trialService.js
 * remains the sole owner of trial state.
 *
 * Mounted in server.js BEFORE the existing '/admin' router so that route
 * matching order can never shadow these paths:
 *   app.use('/admin/access', require('./routes/adminAccess'));
 *
 * auth.js verified: exports { authenticate, authorize, ownCoachOnly, audit },
 * and authenticate loads the full user row, so req.user.id and
 * req.user.role are both available.
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const VALID_PLANS = ['starter', 'professional', 'academy'];
const VALID_STATUSES = ['trialing', 'active', 'restricted', 'canceled', 'past_due'];

// UUID guard so a malformed :id produces a clean 400 rather than a
// Postgres "invalid input syntax for type uuid" 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── GET /admin/access/users — list coaches with their current access level ───
// Optional query params: ?email=partial&plan=starter&status=active&limit=&offset=
router.get('/users', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const { email, plan, status } = req.query;

    if (plan && !VALID_PLANS.includes(plan)) {
      return res.status(400).json({ error: `plan must be one of: ${VALID_PLANS.join(', ')}` });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const conditions = [];
    const values = [];
    let idx = 1;

    if (email) {
      conditions.push(`email ILIKE $${idx++}`);
      values.push(`%${email}%`);
    }
    if (plan) {
      conditions.push(`subscription_plan = $${idx++}`);
      values.push(plan);
    }
    if (status) {
      conditions.push(`subscription_status = $${idx++}`);
      values.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(limit, offset);

    const result = await query(
      `SELECT id, email, name, role, subscription_plan, subscription_status,
              trial_status, trial_expires_at, created_at
         FROM users
         ${where}
        ORDER BY created_at DESC
        LIMIT $${idx++} OFFSET $${idx}`,
      values
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Error listing users for admin access view', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ─── GET /admin/access/users/:id — single coach's access details ──────────────
router.get('/users/:id', authenticate, authorize('super_admin'), async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  try {
    const result = await query(
      `SELECT id, email, name, role, subscription_plan, subscription_status,
              stripe_customer_id, stripe_subscription_id,
              trial_status, trial_started_at, trial_expires_at, trial_extended,
              created_at
         FROM users
        WHERE id = $1`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching user access detail', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ─── PATCH /admin/access/users/:id — grant or restrict access ─────────────────
// Body: { subscription_plan?: 'starter' | 'professional' | 'academy',
//         subscription_status?: 'trialing' | 'active' | 'restricted' | 'canceled' | 'past_due' }
router.patch('/users/:id', authenticate, authorize('super_admin'), async (req, res) => {
  const { subscription_plan, subscription_status } = req.body || {};

  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (subscription_plan && !VALID_PLANS.includes(subscription_plan)) {
    return res.status(400).json({ error: `subscription_plan must be one of: ${VALID_PLANS.join(', ')}` });
  }
  if (subscription_status && !VALID_STATUSES.includes(subscription_status)) {
    return res.status(400).json({ error: `subscription_status must be one of: ${VALID_STATUSES.join(', ')}` });
  }
  if (!subscription_plan && !subscription_status) {
    return res.status(400).json({ error: 'Provide subscription_plan and/or subscription_status to update' });
  }

  try {
    // Capture the previous values so the audit entry records what changed,
    // not just what it was set to.
    const before = await query(
      'SELECT subscription_plan, subscription_status FROM users WHERE id = $1',
      [req.params.id]
    );

    if (!before.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await query(
      `UPDATE users
          SET subscription_plan   = COALESCE($1, subscription_plan),
              subscription_status = COALESCE($2, subscription_status),
              updated_at = NOW()
        WHERE id = $3
      RETURNING id, email, name, subscription_plan, subscription_status`,
      [subscription_plan || null, subscription_status || null, req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Best-effort audit log — non-fatal, so a logging problem can never block
    // a legitimate access change.
    try {
      await query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, inputs, outputs, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          req.user.id, // the admin performing the change
          'admin_access_update',
          'users',
          req.params.id,
          JSON.stringify({
            requested: { subscription_plan, subscription_status },
            previous: before.rows[0],
          }),
          JSON.stringify(result.rows[0]),
          req.ip,
          req.headers['user-agent'],
        ]
      );
    } catch (auditErr) {
      logger.warn('Audit log failed (non-fatal)', { error: auditErr.message });
    }

    logger.info(`Admin ${req.user.id} updated access for user ${req.params.id}`, {
      from: before.rows[0],
      to: {
        subscription_plan: result.rows[0].subscription_plan,
        subscription_status: result.rows[0].subscription_status,
      },
    });

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating user access', { error: error.message });
    res.status(500).json({ error: 'Failed to update access level' });
  }
});

module.exports = router;
