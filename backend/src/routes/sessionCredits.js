const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { pool, query, cache } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const CREDIT_REASONS = ['weather', 'coach_cancellation', 'facility_closure', 'shortened_session', 'other'];

function requestedCoachId(req) {
  return req.user.role === 'super_admin' && req.query.coach_id ? req.query.coach_id : req.user.id;
}

function normalisePlayerIds(playerIds) {
  return [...new Set((Array.isArray(playerIds) ? playerIds : []).filter(Boolean))];
}

function resolveCreditMinutes({ credit_minutes, planned_duration_minutes, actual_duration_minutes }) {
  const directMinutes = credit_minutes === undefined || credit_minutes === null || credit_minutes === ''
    ? null
    : Number(credit_minutes);
  const plannedMinutes = planned_duration_minutes === undefined || planned_duration_minutes === null || planned_duration_minutes === ''
    ? null
    : Number(planned_duration_minutes);
  const actualMinutes = actual_duration_minutes === undefined || actual_duration_minutes === null || actual_duration_minutes === ''
    ? null
    : Number(actual_duration_minutes);

  if ([directMinutes, plannedMinutes, actualMinutes].some(value => value !== null && (!Number.isInteger(value) || value < 0 || value > 480))) {
    throw Object.assign(new Error('Credit and duration values must be whole minutes between 0 and 480'), { code: 'INVALID_CREDIT' });
  }
  if ((plannedMinutes === null) !== (actualMinutes === null)) {
    throw Object.assign(new Error('Provide both planned and actual duration to calculate a shortfall'), { code: 'INVALID_CREDIT' });
  }
  if (plannedMinutes !== null && actualMinutes > plannedMinutes) {
    throw Object.assign(new Error('Actual duration cannot exceed planned duration for a credit entry'), { code: 'INVALID_CREDIT' });
  }

  const calculatedMinutes = plannedMinutes === null ? null : plannedMinutes - actualMinutes;
  if (directMinutes !== null && calculatedMinutes !== null && directMinutes !== calculatedMinutes) {
    throw Object.assign(new Error('Direct credit minutes must match the planned-duration shortfall when both are supplied'), { code: 'INVALID_CREDIT' });
  }

  const creditMinutes = directMinutes ?? calculatedMinutes;
  if (!Number.isInteger(creditMinutes) || creditMinutes <= 0) {
    throw Object.assign(new Error('A Session Credit must record more than zero minutes owed'), { code: 'INVALID_CREDIT' });
  }

  return { creditMinutes, plannedMinutes, actualMinutes };
}

async function validateCreditPlayers(playerIds, coachId, db) {
  const ids = normalisePlayerIds(playerIds);
  if (!ids.length) throw Object.assign(new Error('Select at least one Player Register entry for the Session Credit'), { code: 'INVALID_CREDIT' });
  const players = await db.query(
    'SELECT id, name FROM players WHERE coach_id = $1 AND id = ANY($2::uuid[])',
    [coachId, ids],
  );
  if (players.rows.length !== ids.length) {
    throw Object.assign(new Error('One or more selected players are not in your Player Register'), { code: 'INVALID_CREDIT' });
  }
  return ids;
}

// GET /session-credits/summary — informational time balance for player, income, and renewal views.
router.get('/summary', authenticate, async (req, res) => {
  const coachId = requestedCoachId(req);
  try {
    const result = await query(`
      SELECT
        p.id AS player_id,
        p.name AS player_name,
        COALESCE(SUM(sc.credit_minutes) FILTER (WHERE sc.is_resolved = false), 0)::int AS open_credit_minutes,
        COUNT(sc.id) FILTER (WHERE sc.is_resolved = false)::int AS open_credit_count,
        MAX(sc.credit_date) FILTER (WHERE sc.is_resolved = false) AS most_recent_credit_date
      FROM players p
      LEFT JOIN session_credits sc ON sc.player_id = p.id AND sc.coach_id = p.coach_id
      WHERE p.coach_id = $1
      GROUP BY p.id, p.name
      HAVING COALESCE(SUM(sc.credit_minutes) FILTER (WHERE sc.is_resolved = false), 0) > 0
      ORDER BY open_credit_minutes DESC, p.name
    `, [coachId]);
    const totalMinutes = result.rows.reduce((sum, row) => sum + Number(row.open_credit_minutes || 0), 0);
    res.json({
      summary: { open_credit_minutes: totalMinutes, open_credit_count: result.rows.reduce((sum, row) => sum + Number(row.open_credit_count || 0), 0) },
      players: result.rows,
    });
  } catch (err) {
    logger.error('Get Session Credit summary error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch Session Credit summary' });
  }
});

// GET /session-credits — player-specific or coach-wide time-credit ledger.
router.get('/', authenticate, async (req, res) => {
  const { player_id, include_resolved = 'true', limit = 100 } = req.query;
  const coachId = requestedCoachId(req);
  try {
    const params = [coachId];
    const filters = ['sc.coach_id = $1'];
    if (player_id) { params.push(player_id); filters.push(`sc.player_id = $${params.length}`); }
    if (include_resolved !== 'true') filters.push('sc.is_resolved = false');
    params.push(Math.min(Math.max(parseInt(limit, 10) || 100, 1), 250));
    const result = await query(`
      SELECT sc.*, p.name AS player_name, s.session_date, s.duration_minutes AS session_duration_minutes
      FROM session_credits sc
      JOIN players p ON p.id = sc.player_id
      LEFT JOIN sessions s ON s.id = sc.session_id
      WHERE ${filters.join(' AND ')}
      ORDER BY sc.is_resolved ASC, sc.credit_date DESC, sc.created_at DESC
      LIMIT $${params.length}
    `, params);
    res.json({ credits: result.rows });
  } catch (err) {
    logger.error('Get Session Credits error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch Session Credits' });
  }
});

// POST /session-credits — create a time-only credit for one or more player entries.
router.post('/', authenticate, [
  body('player_ids').isArray({ min: 1 }),
  body('session_id').optional({ nullable: true }).isUUID(),
  body('credit_date').optional().isISO8601(),
  body('credit_reason').optional().isIn(CREDIT_REASONS),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    player_ids, session_id, credit_date, credit_minutes,
    planned_duration_minutes, actual_duration_minutes,
    credit_reason = 'other', note,
  } = req.body;
  let client;
  try {
    const { creditMinutes, plannedMinutes, actualMinutes } = resolveCreditMinutes({ credit_minutes, planned_duration_minutes, actual_duration_minutes });
    client = await pool.connect();
    await client.query('BEGIN');
    const playerIds = await validateCreditPlayers(player_ids, req.user.id, client);

    if (session_id) {
      const session = await client.query('SELECT id FROM sessions WHERE id = $1 AND coach_id = $2', [session_id, req.user.id]);
      if (!session.rows.length) throw Object.assign(new Error('Session not found'), { code: 'INVALID_CREDIT' });
      const linkedParticipants = await client.query(
        'SELECT player_id FROM session_participants WHERE session_id = $1 AND coach_id = $2 AND player_id = ANY($3::uuid[])',
        [session_id, req.user.id, playerIds],
      );
      if (linkedParticipants.rows.length !== playerIds.length) {
        throw Object.assign(new Error('A Session Credit can only be recorded for players linked to that session'), { code: 'INVALID_CREDIT' });
      }
    }

    const inserted = [];
    for (const playerId of playerIds) {
      const result = await client.query(`
        INSERT INTO session_credits (
          coach_id, player_id, session_id, credit_date, credit_minutes,
          planned_duration_minutes, actual_duration_minutes, credit_reason, note
        ) VALUES ($1,$2,$3,COALESCE($4, CURRENT_DATE),$5,$6,$7,$8,$9)
        RETURNING *
      `, [
        req.user.id, playerId, session_id || null, credit_date || null, creditMinutes,
        plannedMinutes, actualMinutes, credit_reason, note?.trim() || null,
      ]);
      inserted.push(result.rows[0]);
    }
    await client.query('COMMIT');
    await Promise.all(playerIds.map(playerId => cache.del(`player:${playerId}`)));
    logger.info('Session Credits created', { coachId: req.user.id, sessionId: session_id || null, playerCount: playerIds.length, creditMinutes });
    res.status(201).json({ credits: inserted });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    logger.error('Create Session Credit error', { error: err.message });
    const status = err.code === '23505' ? 409 : err.code === 'INVALID_CREDIT' ? 400 : 500;
    res.status(status).json({ error: err.code === '23505' ? 'A Session Credit already exists for this player and session' : err.message || 'Failed to create Session Credit' });
  } finally {
    client?.release();
  }
});

// PATCH /session-credits/:id/resolve — records that the coach has manually made up the owed time.
router.patch('/:id/resolve', authenticate, async (req, res) => {
  const isResolved = req.body.is_resolved !== false;
  try {
    const result = await query(`
      UPDATE session_credits
      SET is_resolved = $1,
          resolved_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
          updated_at = NOW()
      WHERE id = $2 AND coach_id = $3
      RETURNING *
    `, [isResolved, req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Session Credit not found' });
    await cache.del(`player:${result.rows[0].player_id}`);
    res.json({ credit: result.rows[0] });
  } catch (err) {
    logger.error('Resolve Session Credit error', { error: err.message });
    res.status(500).json({ error: 'Failed to update Session Credit' });
  }
});

module.exports = router;
