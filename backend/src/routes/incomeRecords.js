const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const { pool, query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const RECEIVED_VIA = ['bank_transfer', 'cash', 'card_reader', 'cheque', 'other'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function coachIdFor(req) {
  return req.user.role === 'super_admin' && req.query.coach_id ? req.query.coach_id : req.user.id;
}

function safeLimit(value) {
  return Math.min(Math.max(parseInt(value, 10) || 50, 1), 250);
}

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
    throw Object.assign(new Error('Amount must be greater than zero and no more than 1,000,000'), { code: 'INVALID_INCOME' });
  }
  return Math.round(amount * 100) / 100;
}

async function validatePlayerOwnership(playerId, coachId, db) {
  const player = await db.query('SELECT id, name FROM players WHERE id = $1 AND coach_id = $2', [playerId, coachId]);
  if (!player.rows.length) throw Object.assign(new Error('Choose a player from your Player Register'), { code: 'INVALID_INCOME' });
  return player.rows[0];
}

function recordSelect(whereClause) {
  return `
    SELECT
      ir.*,
      p.name AS player_name,
      COALESCE(credit_balance.open_credit_minutes, 0)::int AS open_credit_minutes
    FROM income_records ir
    JOIN players p ON p.id = ir.player_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(sc.credit_minutes) FILTER (WHERE sc.is_resolved = false), 0) AS open_credit_minutes
      FROM session_credits sc
      WHERE sc.player_id = ir.player_id AND sc.coach_id = ir.coach_id
    ) credit_balance ON true
    ${whereClause}
  `;
}

// GET /income-records — manual bookkeeping entries with totals for a player or date range.
router.get('/', authenticate, async (req, res) => {
  const coachId = coachIdFor(req);
  const { player_id, from, to, limit } = req.query;
  const params = [coachId];
  const filters = ['ir.coach_id = $1'];
  if (player_id) { params.push(player_id); filters.push(`ir.player_id = $${params.length}`); }
  if (from) { params.push(from); filters.push(`ir.received_date >= $${params.length}::date`); }
  if (to) { params.push(to); filters.push(`ir.received_date <= $${params.length}::date`); }
  const whereClause = `WHERE ${filters.join(' AND ')}`;
  try {
    const dataParams = [...params, safeLimit(limit)];
    const [recordsResult, totalResult, playerTotalsResult] = await Promise.all([
      query(`${recordSelect(whereClause)} ORDER BY ir.received_date DESC, ir.created_at DESC LIMIT $${dataParams.length}`, dataParams),
      query(`SELECT COALESCE(SUM(ir.amount), 0)::numeric(12,2) AS total_amount, COUNT(*)::int AS record_count FROM income_records ir ${whereClause}`, params),
      query(`
        SELECT ir.player_id, p.name AS player_name, COALESCE(SUM(ir.amount), 0)::numeric(12,2) AS total_amount, COUNT(*)::int AS record_count
        FROM income_records ir JOIN players p ON p.id = ir.player_id
        ${whereClause}
        GROUP BY ir.player_id, p.name
        ORDER BY total_amount DESC, p.name
      `, params),
    ]);
    res.json({
      records: recordsResult.rows,
      summary: { total_amount: Number(totalResult.rows[0].total_amount), record_count: totalResult.rows[0].record_count },
      player_totals: playerTotalsResult.rows.map(row => ({ ...row, total_amount: Number(row.total_amount) })),
    });
  } catch (err) {
    logger.error('Get manual income records error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch income records' });
  }
});

// GET /income-records/summary — read-only income and open Session Credit context for business, renewal, and income views.
router.get('/summary', authenticate, async (req, res) => {
  const coachId = coachIdFor(req);
  try {
    const result = await query(`
      SELECT
        COALESCE((SELECT SUM(amount) FROM income_records WHERE coach_id = $1 AND received_date >= date_trunc('month', CURRENT_DATE)::date), 0)::numeric(12,2) AS income_this_month,
        COALESCE((SELECT SUM(amount) FROM income_records WHERE coach_id = $1 AND received_date >= (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date AND received_date < date_trunc('month', CURRENT_DATE)::date), 0)::numeric(12,2) AS income_previous_month,
        COALESCE((SELECT SUM(credit_minutes) FROM session_credits WHERE coach_id = $1 AND is_resolved = false), 0)::int AS open_credit_minutes,
        COALESCE((SELECT COUNT(*) FROM session_credits WHERE coach_id = $1 AND is_resolved = false), 0)::int AS open_credit_count
    `, [coachId]);
    const summary = result.rows[0];
    const current = Number(summary.income_this_month);
    const prior = Number(summary.income_previous_month);
    res.json({
      income_this_month: current,
      income_previous_month: prior,
      income_trend: prior > 0 ? Math.round(((current - prior) / prior) * 1000) / 10 : null,
      open_credit_minutes: summary.open_credit_minutes,
      open_credit_count: summary.open_credit_count,
    });
  } catch (err) {
    logger.error('Get manual income summary error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch income summary' });
  }
});

// POST /income-records — records funds the coach has already received. No payment processing occurs here.
router.post('/', authenticate, [
  body('player_id').matches(UUID_PATTERN),
  body('received_date').isISO8601(),
  body('received_via').optional().isIn(RECEIVED_VIA),
  body('note').optional({ nullable: true }).isString().isLength({ max: 2000 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { player_id, received_date, received_via = 'bank_transfer', note } = req.body;
  let client;
  try {
    const amount = parseAmount(req.body.amount);
    client = await pool.connect();
    await client.query('BEGIN');
    const player = await validatePlayerOwnership(player_id, req.user.id, client);
    const result = await client.query(`
      INSERT INTO income_records (coach_id, player_id, amount, received_date, received_via, note)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [req.user.id, player.id, amount, received_date, received_via, note?.trim() || null]);
    await client.query('COMMIT');
    logger.info('Manual income recorded', { coachId: req.user.id, playerId: player.id, amount, receivedVia: received_via });
    res.status(201).json({ income_record: { ...result.rows[0], player_name: player.name } });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    logger.error('Create manual income record error', { error: err.message });
    res.status(err.code === 'INVALID_INCOME' ? 400 : 500).json({ error: err.message || 'Failed to record income' });
  } finally {
    client?.release();
  }
});

// PUT /income-records/:id — correct a coach-owned bookkeeping record; this still never initiates a payment.
router.put('/:id', authenticate, [
  body('player_id').matches(UUID_PATTERN),
  body('received_date').isISO8601(),
  body('received_via').optional().isIn(RECEIVED_VIA),
  body('note').optional({ nullable: true }).isString().isLength({ max: 2000 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { player_id, received_date, received_via = 'bank_transfer', note } = req.body;
  let client;
  try {
    const amount = parseAmount(req.body.amount);
    client = await pool.connect();
    await client.query('BEGIN');
    const player = await validatePlayerOwnership(player_id, req.user.id, client);
    const result = await client.query(`
      UPDATE income_records
      SET player_id = $1, amount = $2, received_date = $3, received_via = $4, note = $5, updated_at = NOW()
      WHERE id = $6 AND coach_id = $7
      RETURNING *
    `, [player.id, amount, received_date, received_via, note?.trim() || null, req.params.id, req.user.id]);
    if (!result.rows.length) throw Object.assign(new Error('Income record not found'), { code: 'NOT_FOUND' });
    await client.query('COMMIT');
    res.json({ income_record: { ...result.rows[0], player_name: player.name } });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    logger.error('Update manual income record error', { error: err.message });
    res.status(err.code === 'INVALID_INCOME' ? 400 : err.code === 'NOT_FOUND' ? 404 : 500).json({ error: err.message || 'Failed to update income record' });
  } finally {
    client?.release();
  }
});

module.exports = router;
