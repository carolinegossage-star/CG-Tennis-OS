const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, cache } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
const PROGRAMME_TYPES = ['individual', 'group', 'pair'];

function coachIdFor(req) {
  return req.user.role === 'super_admin' && req.query.coach_id ? req.query.coach_id : req.user.id;
}

function normaliseDays(days) {
  if (days === undefined || days === null) return [];
  if (!Array.isArray(days)) throw Object.assign(new Error('days_of_week must be an array'), { code: 'INVALID_DAYS' });
  const values = [...new Set(days.map(Number))].sort((a, b) => a - b);
  if (values.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw Object.assign(new Error('days_of_week must contain whole numbers from 0 to 6'), { code: 'INVALID_DAYS' });
  }
  return values;
}

function programmeValues(input) {
  const type = input.programme_type;
  if (!PROGRAMME_TYPES.includes(type)) {
    throw Object.assign(new Error('programme_type must be individual, group, or pair'), { code: 'INVALID_PROGRAMME_TYPE' });
  }

  const capacity = input.capacity === '' || input.capacity === null || input.capacity === undefined
    ? null
    : Number(input.capacity);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
    throw Object.assign(new Error('capacity must be a positive whole number'), { code: 'INVALID_CAPACITY' });
  }

  const duration = input.duration_minutes === '' || input.duration_minutes === null || input.duration_minutes === undefined
    ? null
    : Number(input.duration_minutes);
  if (duration !== null && (!Number.isInteger(duration) || duration < 15 || duration > 480)) {
    throw Object.assign(new Error('duration_minutes must be between 15 and 480'), { code: 'INVALID_DURATION' });
  }

  return {
    name: String(input.name || '').trim(),
    programme_type: type,
    days_of_week: normaliseDays(input.days_of_week),
    start_time: input.start_time || null,
    duration_minutes: duration,
    location: input.location?.trim() || null,
    capacity,
    notes: input.notes?.trim() || null,
  };
}

function programmeSelect() {
  return `
    SELECT cp.*,
      COALESCE(participants.active_player_count, 0)::int AS active_player_count,
      COALESCE(activity.sessions_last_30_days, 0)::int AS sessions_last_30_days,
      COALESCE(activity.completed_sessions_last_30_days, 0)::int AS completed_sessions_last_30_days,
      activity.last_session_date
    FROM coaching_programmes cp
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS active_player_count
      FROM player_programmes pp
      WHERE pp.programme_id = cp.id AND pp.is_active = true
    ) participants ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE s.session_date >= CURRENT_DATE - INTERVAL '30 days') AS sessions_last_30_days,
        COUNT(*) FILTER (WHERE s.session_date >= CURRENT_DATE - INTERVAL '30 days' AND s.is_completed = true) AS completed_sessions_last_30_days,
        MAX(s.session_date) AS last_session_date
      FROM sessions s
      WHERE s.programme_id = cp.id
    ) activity ON true
  `;
}

// GET /programmes — active coach-owned Programmes with 30-day session activity.
router.get('/', authenticate, async (req, res) => {
  const { active = 'true' } = req.query;
  const coachId = coachIdFor(req);
  try {
    const result = await query(`
      ${programmeSelect()}
      WHERE cp.coach_id = $1 AND cp.is_active = $2
      ORDER BY cp.name
    `, [coachId, active === 'true']);
    res.json({ programmes: result.rows });
  } catch (err) {
    logger.error('Get programmes error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch Programmes' });
  }
});

// GET /programmes/analytics/activity — coach-level Programme activity summary.
router.get('/analytics/activity', authenticate, async (req, res) => {
  const coachId = coachIdFor(req);
  try {
    const result = await query(`
      SELECT
        (SELECT COUNT(*)::int FROM coaching_programmes cp WHERE cp.coach_id = $1 AND cp.is_active = true) AS active_programmes,
        (SELECT COUNT(DISTINCT pp.player_id)::int
           FROM player_programmes pp
           JOIN coaching_programmes cp ON cp.id = pp.programme_id
          WHERE cp.coach_id = $1 AND cp.is_active = true AND pp.is_active = true) AS assigned_players,
        (SELECT COUNT(*)::int
           FROM sessions s
           JOIN coaching_programmes cp ON cp.id = s.programme_id
          WHERE cp.coach_id = $1 AND s.session_date >= CURRENT_DATE - INTERVAL '30 days') AS sessions_last_30_days,
        (SELECT COUNT(*)::int
           FROM sessions s
           JOIN coaching_programmes cp ON cp.id = s.programme_id
          WHERE cp.coach_id = $1
            AND s.session_date >= CURRENT_DATE - INTERVAL '30 days'
            AND s.is_completed = true) AS completed_sessions_last_30_days
    `, [coachId]);
    res.json({ summary: result.rows[0] });
  } catch (err) {
    logger.error('Get programme analytics error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch Programme activity' });
  }
});

// GET /programmes/:id — Programme detail and active player roster.
router.get('/:id', authenticate, async (req, res) => {
  const coachId = coachIdFor(req);
  try {
    const programme = await query(`${programmeSelect()} WHERE cp.id = $1 AND cp.coach_id = $2`, [req.params.id, coachId]);
    if (!programme.rows.length) return res.status(404).json({ error: 'Programme not found' });

    const players = await query(`
      SELECT p.id, p.name, p.ranking_current, p.burnout_risk_level, p.dropout_risk_level
      FROM player_programmes pp
      JOIN players p ON p.id = pp.player_id
      WHERE pp.programme_id = $1 AND pp.coach_id = $2 AND pp.is_active = true AND p.is_active = true
      ORDER BY p.name
    `, [req.params.id, coachId]);

    res.json({ ...programme.rows[0], players: players.rows });
  } catch (err) {
    logger.error('Get programme error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch Programme' });
  }
});

// POST /programmes — create a structured Programme for the authenticated coach.
router.post('/', authenticate, authorize('coach', 'academy_director', 'super_admin'), [
  body('name').trim().notEmpty().isLength({ max: 255 }),
  body('programme_type').isIn(PROGRAMME_TYPES),
  body('days_of_week').optional().isArray(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const programme = programmeValues(req.body);
    const result = await query(`
      INSERT INTO coaching_programmes (
        coach_id, name, programme_type, days_of_week, start_time,
        duration_minutes, location, capacity, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      req.user.id, programme.name, programme.programme_type, programme.days_of_week,
      programme.start_time, programme.duration_minutes, programme.location,
      programme.capacity, programme.notes,
    ]);
    await cache.delPattern(`programmes:${req.user.id}:*`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Create programme error', { error: err.message });
    res.status(err.code?.startsWith('INVALID_') ? 400 : 500).json({ error: err.message || 'Failed to create Programme' });
  }
});

// PUT /programmes/:id — update scheduling and operational details.
router.put('/:id', authenticate, authorize('coach', 'academy_director', 'super_admin'), async (req, res) => {
  const coachId = coachIdFor(req);
  try {
    const existing = await query('SELECT * FROM coaching_programmes WHERE id = $1 AND coach_id = $2', [req.params.id, coachId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Programme not found' });

    const merged = { ...existing.rows[0], ...req.body };
    const programme = programmeValues(merged);
    const result = await query(`
      UPDATE coaching_programmes SET
        name = $1, programme_type = $2, days_of_week = $3, start_time = $4,
        duration_minutes = $5, location = $6, capacity = $7, notes = $8,
        updated_at = NOW()
      WHERE id = $9 AND coach_id = $10
      RETURNING *
    `, [
      programme.name, programme.programme_type, programme.days_of_week, programme.start_time,
      programme.duration_minutes, programme.location, programme.capacity, programme.notes,
      req.params.id, coachId,
    ]);
    await cache.delPattern(`programmes:${coachId}:*`);
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Update programme error', { error: err.message });
    res.status(err.code?.startsWith('INVALID_') ? 400 : 500).json({ error: err.message || 'Failed to update Programme' });
  }
});

// DELETE /programmes/:id — archive the Programme; historical sessions retain their reference.
router.delete('/:id', authenticate, authorize('coach', 'academy_director', 'super_admin'), async (req, res) => {
  const coachId = coachIdFor(req);
  try {
    const result = await query(`
      UPDATE coaching_programmes SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND coach_id = $2 AND is_active = true
      RETURNING *
    `, [req.params.id, coachId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Active Programme not found' });
    await query(`
      UPDATE player_programmes
      SET is_active = false, updated_at = NOW()
      WHERE programme_id = $1 AND coach_id = $2 AND is_active = true
    `, [req.params.id, coachId]);
    await cache.delPattern(`programmes:${coachId}:*`);
    await cache.delPattern('player:*');
    res.json({ message: 'Programme archived', programme: result.rows[0] });
  } catch (err) {
    logger.error('Archive programme error', { error: err.message });
    res.status(500).json({ error: 'Failed to archive Programme' });
  }
});

module.exports = router;
