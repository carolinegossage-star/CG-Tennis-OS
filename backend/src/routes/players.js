const express = require('express');
const router = express.Router();
const { body, query: qv, validationResult } = require('express-validator');
const { pool, query, cache } = require('../config/database');
const { authenticate, authorize, audit } = require('../middleware/auth');
const retentionService = require('../services/retentionService');
const logger = require('../utils/logger');
const { getAccessContext } = require('../services/accessContext');
const { syncPlayerProgrammes } = require('../services/programmeAssignmentService');

const ACTIVE_PLAYER_CAPS = { solo: 35, professional: 100 };
const LEGACY_PLAN_ALIASES = { starter: 'solo' };

function normalizedPlan(plan) {
  return LEGACY_PLAN_ALIASES[plan] || plan || 'solo';
}

// GET /players — list coach's players with database-ready summary fields.
router.get('/', authenticate, async (req, res) => {
  const { search, risk, active = 'true', limit = 50, offset = 0 } = req.query;
  const coachId = req.user.role === 'super_admin' ? req.query.coach_id : req.user.id;
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  try {
    const filters = ['p.coach_id = $1'];
    const params = [coachId];
    if (active !== 'all') {
      filters.push(`p.is_active = $${params.length + 1}`);
      params.push(active === 'true');
    }

    if (search) {
      filters.push(`p.name ILIKE $${params.length + 1}`);
      params.push(`%${search}%`);
    }
    if (risk) {
      filters.push(`(p.burnout_risk_level = $${params.length + 1} OR p.dropout_risk_level = $${params.length + 1})`);
      params.push(risk);
    }

    const where = `WHERE ${filters.join(' AND ')}`;
    const result = await query(`
      SELECT p.*,
        COALESCE(session_stats.total_sessions, 0)::int AS total_sessions,
        COALESCE(session_stats.sessions_this_month, 0)::int AS sessions_this_month,
        session_stats.last_session_date,
        COALESCE(metric_stats.current_enjoyment, p.enjoyment_score) AS current_enjoyment,
        COALESCE(metric_stats.current_engagement, p.engagement_score) AS current_engagement,
        programme_info.programmes,
        programme_info.programme_ids
      FROM players p
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE s.is_completed = true) AS total_sessions,
          COUNT(*) FILTER (
            WHERE s.is_completed = true
              AND s.session_date >= date_trunc('month', CURRENT_DATE)
          ) AS sessions_this_month,
          MAX(s.session_date) FILTER (WHERE s.is_completed = true) AS last_session_date
        FROM sessions s
        WHERE s.player_id = p.id
      ) session_stats ON true
      LEFT JOIN LATERAL (
        SELECT
          ROUND(AVG(rm.enjoyment_score)::numeric, 1) AS current_enjoyment,
          ROUND(AVG(rm.engagement_score)::numeric, 1) AS current_engagement
        FROM retention_metrics rm
        WHERE rm.player_id = p.id
          AND rm.recorded_date > NOW() - INTERVAL '30 days'
      ) metric_stats ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(json_agg(json_build_object('id', cp.id, 'name', cp.name, 'programme_type', cp.programme_type) ORDER BY cp.name), '[]'::json) AS programmes,
          COALESCE(array_agg(cp.id ORDER BY cp.name), ARRAY[]::uuid[]) AS programme_ids
        FROM player_programmes pp
        JOIN coaching_programmes cp ON cp.id = pp.programme_id
        WHERE pp.player_id = p.id AND pp.coach_id = p.coach_id AND pp.is_active = true
      ) programme_info ON true
      ${where}
      ORDER BY p.name
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, safeLimit, safeOffset]);

    const countResult = await query(
      `SELECT COUNT(*) FROM players p ${where}`,
      params
    );

    res.json({
      players: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit: safeLimit,
      offset: safeOffset,
    });
  } catch (err) {
    logger.error('Get players error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// GET /players/analytics/retention — this route must precede /:id.
router.get('/analytics/retention', authenticate, async (req, res) => {
  try {
    const coachId = req.user.role === 'super_admin' ? req.query.coach_id : req.user.id;
    const analytics = await retentionService.getCoachRetentionAnalytics(coachId);
    res.json(analytics);
  } catch (err) {
    logger.error('Retention analytics error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch retention analytics' });
  }
});

// GET /players/:id — full player profile for the database detail panel.
router.get('/:id', authenticate, async (req, res) => {
  try {
    const cacheKey = `player:${req.params.id}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      if (req.user.role === 'coach' && cached.coach_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      return res.json(cached);
    }

    const result = await query(`
      SELECT p.*,
        COALESCE(session_stats.total_sessions, 0)::int AS total_sessions,
        COALESCE(session_stats.sessions_this_month, 0)::int AS sessions_this_month,
        session_stats.last_session_date,
        COALESCE(retention_history.items, '[]'::json) AS retention_history,
        COALESCE(tournament_history.items, '[]'::json) AS tournament_entries,
        programme_info.programmes,
        programme_info.programme_ids
      FROM players p
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE s.is_completed = true) AS total_sessions,
          COUNT(*) FILTER (
            WHERE s.is_completed = true
              AND s.session_date >= date_trunc('month', CURRENT_DATE)
          ) AS sessions_this_month,
          MAX(s.session_date) FILTER (WHERE s.is_completed = true) AS last_session_date
        FROM sessions s
        WHERE s.player_id = p.id
      ) session_stats ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(rm ORDER BY rm.recorded_date DESC) AS items
        FROM retention_metrics rm
        WHERE rm.player_id = p.id
      ) retention_history ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(te) AS items
        FROM tournament_entries te
        WHERE te.player_id = p.id
      ) tournament_history ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(json_agg(json_build_object('id', cp.id, 'name', cp.name, 'programme_type', cp.programme_type) ORDER BY cp.name), '[]'::json) AS programmes,
          COALESCE(array_agg(cp.id ORDER BY cp.name), ARRAY[]::uuid[]) AS programme_ids
        FROM player_programmes pp
        JOIN coaching_programmes cp ON cp.id = pp.programme_id
        WHERE pp.player_id = p.id AND pp.coach_id = p.coach_id AND pp.is_active = true
      ) programme_info ON true
      WHERE p.id = $1
    `, [req.params.id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Player not found' });

    const player = result.rows[0];
    if (req.user.role === 'coach' && player.coach_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await cache.set(cacheKey, player, 120);
    res.json(player);
  } catch (err) {
    logger.error('Get player error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch player' });
  }
});

// POST /players
router.post('/', authenticate, authorize('coach', 'academy_director', 'super_admin'), [
  body('name').trim().notEmpty().isLength({ max: 255 }),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().normalizeEmail(),
  body('date_of_birth').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body('enrolment_date').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body('programme_ids').optional().isArray(),
], audit('create_player', 'players'), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    name, date_of_birth, gender, nationality, email, phone,
    parent_name, parent_email, parent_phone, notes,
    ranking_current, itf_id, lta_id, enrolment_date, programme_ids = []
  } = req.body;

  let client;
  try {
    // Academy and administrative roles are intentionally not constrained by
    // the single-coach Solo/Professional caps. Multi-coach Academy capacity
    // remains a separate contact-sales capability.
    if (req.user.role === 'coach') {
      const access = req.user.access || getAccessContext(req.user);
      const plan = access.isAdmin || access.isComped
        ? access.effectivePlan
        : normalizedPlan((await query(
          `SELECT COALESCE(subscription_plan, 'solo') AS subscription_plan
             FROM users
            WHERE id = $1`,
          [req.user.id]
        )).rows[0]?.subscription_plan);
      const cap = ACTIVE_PLAYER_CAPS[plan];

      if (!access.isAdmin && cap) {
        const countResult = await query(
          `SELECT COUNT(*)::int AS count
             FROM players
            WHERE coach_id = $1 AND is_active = true`,
          [req.user.id]
        );
        const activeCount = countResult.rows[0].count;
        if (activeCount >= cap) {
          return res.status(403).json({
            error: `Your ${plan === 'solo' ? 'Solo Coach' : 'Professional Coach'} plan supports up to ${cap} active player profiles.`,
            code: 'PLAYER_PROFILE_LIMIT_REACHED',
            plan,
            currentCount: activeCount,
            limit: cap,
            upgradePlan: plan === 'solo' ? 'professional' : null,
            upgradeRequired: plan === 'solo',
          });
        }
      }
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO players (
        coach_id, name, date_of_birth, gender, nationality, email, phone,
        parent_name, parent_email, parent_phone, notes, ranking_current, itf_id, lta_id, enrolment_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [
      req.user.id, name, date_of_birth || null, gender || null, nationality || null,
      email || null, phone || null, parent_name || null, parent_email || null,
      parent_phone || null, notes || null, ranking_current || null, itf_id || null, lta_id || null,
      enrolment_date || new Date().toISOString().slice(0, 10),
    ]);

    const programmeIds = await syncPlayerProgrammes({
      playerId: result.rows[0].id,
      coachId: req.user.id,
      programmeIds: programme_ids,
      db: client,
    });
    await client.query('UPDATE coach_profiles SET player_count = player_count + 1 WHERE user_id = $1', [req.user.id]);
    await client.query('COMMIT');

    logger.info('Player created', { coachId: req.user.id, playerId: result.rows[0].id });
    res.status(201).json({ ...result.rows[0], programme_ids: programmeIds });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    logger.error('Create player error', { error: err.message });
    res.status(err.code === 'INVALID_PROGRAMME_ASSIGNMENTS' ? 400 : 500).json({ error: err.message || 'Failed to create player' });
  } finally {
    client?.release();
  }
});

// PUT /players/:id
router.put('/:id', authenticate, async (req, res) => {
  const hasProgrammeAssignments = Object.prototype.hasOwnProperty.call(req.body, 'programme_ids');
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const existing = await client.query('SELECT * FROM players WHERE id = $1', [req.params.id]);
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Player not found' });
    }
    if (req.user.role === 'coach' && existing.rows[0].coach_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied' });
    }

    const allowedFields = [
      'name', 'date_of_birth', 'gender', 'nationality', 'email', 'phone',
      'parent_name', 'parent_email', 'parent_phone', 'ranking_current', 'ranking_trajectory',
      'milestones', 'enjoyment_score', 'engagement_score', 'burnout_risk_level',
      'dropout_risk_level', 'confidence_score', 'resilience_score', 'communication_score',
      'leadership_score', 'notes', 'is_active', 'itf_id', 'lta_id', 'enrolment_date',
    ];
    const updates = [];
    const values = [];
    let paramIdx = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramIdx}`);
        values.push(req.body[field]);
        paramIdx += 1;
      }
    }

    if (!updates.length && !hasProgrammeAssignments) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    let player = existing.rows[0];
    if (updates.length) {
      values.push(req.params.id);
      const result = await client.query(
        `UPDATE players SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIdx} RETURNING *`,
        values,
      );
      player = result.rows[0];
    }

    let programmeIds;
    if (hasProgrammeAssignments) {
      programmeIds = await syncPlayerProgrammes({
        playerId: req.params.id,
        coachId: existing.rows[0].coach_id,
        programmeIds: req.body.programme_ids,
        db: client,
      });
    }
    await client.query('COMMIT');
    await cache.del(`player:${req.params.id}`);
    res.json({ ...player, ...(programmeIds ? { programme_ids: programmeIds } : {}) });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    logger.error('Update player error', { error: err.message });
    res.status(err.code === 'INVALID_PROGRAMME_ASSIGNMENTS' ? 400 : 500).json({ error: err.message || 'Failed to update player' });
  } finally {
    client?.release();
  }
});

// DELETE /players/:id (soft delete)
router.delete('/:id', authenticate, authorize('coach', 'academy_director', 'super_admin'), async (req, res) => {
  try {
    await query('UPDATE players SET is_active = false WHERE id = $1 AND coach_id = $2', [req.params.id, req.user.id]);
    await query('UPDATE coach_profiles SET player_count = player_count - 1 WHERE user_id = $1', [req.user.id]);
    await cache.del(`player:${req.params.id}`);
    res.json({ message: 'Player deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate player' });
  }
});

// GET /players/:id/risk-summary
router.get('/:id/risk-summary', authenticate, async (req, res) => {
  try {
    const summary = await retentionService.getPlayerRiskSummary(req.params.id);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch risk summary' });
  }
});

module.exports = router;
