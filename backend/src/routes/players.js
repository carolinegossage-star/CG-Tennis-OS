const express = require('express');
const router = express.Router();
const { body, query: qv, validationResult } = require('express-validator');
const { query, cache } = require('../config/database');
const { authenticate, authorize, audit } = require('../middleware/auth');
const retentionService = require('../services/retentionService');
const logger = require('../utils/logger');

const ACTIVE_PLAYER_CAPS = { solo: 35, professional: 100 };
const LEGACY_PLAN_ALIASES = { starter: 'solo' };

function normalizedPlan(plan) {
  return LEGACY_PLAN_ALIASES[plan] || plan || 'solo';
}

// GET /players — list coach's players
router.get('/', authenticate, async (req, res) => {
  const { search, risk, active = 'true', limit = 50, offset = 0 } = req.query;
  const coachId = req.user.role === 'super_admin' ? req.query.coach_id : req.user.id;

  try {
    let sql = `
      SELECT p.*, 
        COUNT(s.id) as total_sessions,
        MAX(s.session_date) as last_session_date,
        COALESCE(AVG(rm.enjoyment_score), p.enjoyment_score) as current_enjoyment,
        COALESCE(AVG(rm.engagement_score), p.engagement_score) as current_engagement
      FROM players p
      LEFT JOIN sessions s ON s.player_id = p.id AND s.is_completed = true
      LEFT JOIN retention_metrics rm ON rm.player_id = p.id AND rm.recorded_date > NOW() - INTERVAL '30 days'
      WHERE p.coach_id = $1 AND p.is_active = $2
    `;
    const params = [coachId, active === 'true'];
    let paramIdx = 3;

    if (search) {
      sql += ` AND p.name ILIKE $${paramIdx}`;
      params.push(`%${search}%`);
      paramIdx++;
    }
    if (risk) {
      sql += ` AND (p.burnout_risk_level = $${paramIdx} OR p.dropout_risk_level = $${paramIdx})`;
      params.push(risk);
      paramIdx++;
    }

    sql += ` GROUP BY p.id ORDER BY p.name LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    const countResult = await query(
      'SELECT COUNT(*) FROM players WHERE coach_id = $1 AND is_active = $2',
      [coachId, active === 'true']
    );

    res.json({
      players: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (err) {
    logger.error('Get players error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// GET /players/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const cacheKey = `player:${req.params.id}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const result = await query(`
      SELECT p.*,
        json_agg(DISTINCT rm.*) FILTER (WHERE rm.id IS NOT NULL) as retention_history,
        json_agg(DISTINCT te.*) FILTER (WHERE te.id IS NOT NULL) as tournament_entries,
        COUNT(DISTINCT s.id) as total_sessions
      FROM players p
      LEFT JOIN retention_metrics rm ON rm.player_id = p.id ORDER BY rm.recorded_date DESC
      LEFT JOIN tournament_entries te ON te.player_id = p.id
      LEFT JOIN sessions s ON s.player_id = p.id AND s.is_completed = true
      WHERE p.id = $1
      GROUP BY p.id
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
  body('email').optional().isEmail().normalizeEmail(),
  body('date_of_birth').optional().isISO8601(),
], audit('create_player', 'players'), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    name, date_of_birth, gender, nationality, email, phone,
    parent_name, parent_email, parent_phone, notes,
    ranking_current, itf_id, lta_id
  } = req.body;

  try {
    // Academy and administrative roles are intentionally not constrained by
    // the single-coach Solo/Professional caps. Multi-coach Academy capacity
    // remains a separate contact-sales capability.
    if (req.user.role === 'coach') {
      const planResult = await query(
        `SELECT COALESCE(subscription_plan, 'solo') AS subscription_plan
           FROM users
          WHERE id = $1`,
        [req.user.id]
      );
      const plan = normalizedPlan(planResult.rows[0]?.subscription_plan);
      const cap = ACTIVE_PLAYER_CAPS[plan];

      if (cap) {
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

    const result = await query(`
      INSERT INTO players (
        coach_id, name, date_of_birth, gender, nationality, email, phone,
        parent_name, parent_email, parent_phone, notes, ranking_current, itf_id, lta_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      req.user.id, name, date_of_birth || null, gender || null, nationality || null,
      email || null, phone || null, parent_name || null, parent_email || null,
      parent_phone || null, notes || null, ranking_current || null, itf_id || null, lta_id || null
    ]);

    // Update coach player count
    await query(
      'UPDATE coach_profiles SET player_count = player_count + 1 WHERE user_id = $1',
      [req.user.id]
    );

    logger.info('Player created', { coachId: req.user.id, playerId: result.rows[0].id });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Create player error', { error: err.message });
    res.status(500).json({ error: 'Failed to create player' });
  }
});

// PUT /players/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const existing = await query('SELECT coach_id FROM players WHERE id = $1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Player not found' });
    if (req.user.role === 'coach' && existing.rows[0].coach_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const allowedFields = [
      'name', 'date_of_birth', 'gender', 'nationality', 'email', 'phone',
      'parent_name', 'parent_email', 'parent_phone', 'ranking_current', 'ranking_trajectory',
      'milestones', 'enjoyment_score', 'engagement_score', 'burnout_risk_level',
      'dropout_risk_level', 'confidence_score', 'resilience_score', 'communication_score',
      'leadership_score', 'notes', 'is_active', 'itf_id', 'lta_id'
    ];

    const updates = [];
    const values = [];
    let paramIdx = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramIdx}`);
        values.push(req.body[field]);
        paramIdx++;
      }
    }

    if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

    values.push(req.params.id);
    const result = await query(
      `UPDATE players SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );

    await cache.del(`player:${req.params.id}`);
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Update player error', { error: err.message });
    res.status(500).json({ error: 'Failed to update player' });
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

// GET /players/analytics/retention
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

module.exports = router;
