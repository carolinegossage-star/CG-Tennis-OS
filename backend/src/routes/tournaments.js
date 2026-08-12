const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { query, cache } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const alertService = require('../services/alertService');
const logger = require('../utils/logger');

// GET /tournaments — with rich filtering
router.get('/', authenticate, async (req, res) => {
  const {
    age_group, category, surface_type, location_country,
    date_from, date_to, entry_open = 'false',
    search, limit = 20, offset = 0
  } = req.query;

  try {
    let sql = `
      SELECT t.*,
        COUNT(te.id) as entry_count,
        CASE WHEN t.entry_deadline IS NOT NULL
          THEN t.entry_deadline - CURRENT_DATE
          ELSE NULL
        END as days_until_entry_deadline,
        CASE WHEN t.entry_deadline IS NOT NULL AND t.entry_deadline - CURRENT_DATE <= 7
          THEN true ELSE false
        END as deadline_urgent
      FROM tournaments t
      LEFT JOIN tournament_entries te ON te.tournament_id = t.id
      WHERE t.end_date >= CURRENT_DATE
    `;
    const params = [];
    let paramIdx = 1;

    if (age_group) {
      sql += ` AND t.age_group = $${paramIdx++}`;
      params.push(age_group);
    }
    if (category) {
      sql += ` AND t.category ILIKE $${paramIdx++}`;
      params.push(`%${category}%`);
    }
    if (surface_type) {
      sql += ` AND t.surface_type = $${paramIdx++}`;
      params.push(surface_type);
    }
    if (location_country) {
      sql += ` AND t.location_country = $${paramIdx++}`;
      params.push(location_country);
    }
    if (date_from) {
      sql += ` AND t.start_date >= $${paramIdx++}`;
      params.push(date_from);
    }
    if (date_to) {
      sql += ` AND t.start_date <= $${paramIdx++}`;
      params.push(date_to);
    }
    if (entry_open === 'true') {
      sql += ` AND t.entry_deadline >= CURRENT_DATE`;
    }
    if (search) {
      sql += ` AND (t.name ILIKE $${paramIdx} OR t.location_name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    sql += ` GROUP BY t.id ORDER BY t.start_date ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);
    res.json({
      tournaments: result.rows,
      total: result.rows.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (err) {
    logger.error('Get tournaments error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch tournaments' });
  }
});

// GET /tournaments/deadlines/:user_id — urgent deadline dashboard
router.get('/deadlines/:user_id', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        t.id, t.name, t.category, t.age_group, t.surface_type,
        t.start_date, t.entry_deadline, t.withdrawal_deadline, t.payment_deadline,
        t.entry_fee, t.currency, t.registration_url,
        t.entry_deadline - CURRENT_DATE as days_until_entry,
        t.withdrawal_deadline - CURRENT_DATE as days_until_withdrawal,
        te.entry_status, te.payment_status, te.confirmation_number,
        p.name as player_name, p.id as player_id,
        CASE
          WHEN t.entry_deadline - CURRENT_DATE <= 2 THEN 'urgent'
          WHEN t.entry_deadline - CURRENT_DATE <= 7 THEN 'warning'
          ELSE 'safe'
        END as deadline_status
      FROM tournaments t
      JOIN tournament_entries te ON te.tournament_id = t.id
      JOIN players p ON p.id = te.player_id
      WHERE p.coach_id = $1
        AND t.entry_deadline >= CURRENT_DATE
        AND te.entry_status NOT IN ('withdrawn')
      ORDER BY t.entry_deadline ASC
      LIMIT 50
    `, [req.params.user_id]);

    const grouped = {
      urgent: result.rows.filter(r => r.deadline_status === 'urgent'),
      warning: result.rows.filter(r => r.deadline_status === 'warning'),
      upcoming: result.rows.filter(r => r.deadline_status === 'safe'),
    };

    res.json(grouped);
  } catch (err) {
    logger.error('Get deadlines error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch deadlines' });
  }
});

// GET /tournaments/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT t.*, t.entry_deadline - CURRENT_DATE as days_until_entry
       FROM tournaments t WHERE t.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Tournament not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tournament' });
  }
});

// POST /tournaments — manual entry or import
router.post('/', authenticate, authorize('coach', 'academy_director', 'federation_admin', 'super_admin'), [
  body('name').trim().notEmpty(),
  body('start_date').isISO8601(),
  body('end_date').isISO8601(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    name, organisation, category, age_group, surface_type,
    location_name, location_country = 'GBR',
    start_date, end_date, entry_deadline, withdrawal_deadline, payment_deadline,
    ranking_points_available, entry_fee, currency = 'GBP',
    registration_url, notes
  } = req.body;

  try {
    const result = await query(`
      INSERT INTO tournaments (
        name, organisation, category, age_group, surface_type,
        location_name, location_country, start_date, end_date,
        entry_deadline, withdrawal_deadline, payment_deadline,
        ranking_points_available, entry_fee, currency, registration_url, notes, source
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'manual')
      RETURNING *
    `, [
      name, organisation || null, category || null, age_group || null, surface_type || null,
      location_name || null, location_country, start_date, end_date,
      entry_deadline || null, withdrawal_deadline || null, payment_deadline || null,
      ranking_points_available || null, entry_fee || null, currency,
      registration_url || null, notes || null
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Create tournament error', { error: err.message });
    res.status(500).json({ error: 'Failed to create tournament' });
  }
});

// POST /tournament-entries
router.post('/entries', authenticate, [
  body('player_id').isUUID(),
  body('tournament_id').isUUID(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { player_id, tournament_id, notes } = req.body;

  try {
    // Verify coach owns this player
    const playerCheck = await query('SELECT coach_id FROM players WHERE id = $1', [player_id]);
    if (!playerCheck.rows.length || playerCheck.rows[0].coach_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await query(`
      INSERT INTO tournament_entries (player_id, tournament_id, coach_id, notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (player_id, tournament_id) DO NOTHING
      RETURNING *
    `, [player_id, tournament_id, req.user.id, notes || null]);

    if (!result.rows.length) {
      return res.status(409).json({ error: 'Entry already exists' });
    }

    // Schedule deadline alert
    await alertService.scheduleDeadlineAlerts(req.user.id, tournament_id);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Create entry error', { error: err.message });
    res.status(500).json({ error: 'Failed to create entry' });
  }
});

// GET /tournament-entries/:player_id
router.get('/entries/player/:player_id', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT te.*, t.name as tournament_name, t.start_date, t.end_date,
             t.entry_deadline, t.location_name, t.category, t.age_group
      FROM tournament_entries te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE te.player_id = $1
      ORDER BY t.start_date DESC
    `, [req.params.player_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// PUT /tournament-entries/:id
router.put('/entries/:id', authenticate, async (req, res) => {
  const { entry_status, payment_status, confirmation_number, notes, withdrawal_reason } = req.body;
  try {
    const result = await query(`
      UPDATE tournament_entries
      SET entry_status = COALESCE($1, entry_status),
          payment_status = COALESCE($2, payment_status),
          confirmation_number = COALESCE($3, confirmation_number),
          notes = COALESCE($4, notes),
          withdrawal_reason = COALESCE($5, withdrawal_reason),
          payment_date = CASE WHEN $2 = 'paid' THEN NOW() ELSE payment_date END
      WHERE id = $6 AND coach_id = $7
      RETURNING *
    `, [
      entry_status || null, payment_status || null, confirmation_number || null,
      notes || null, withdrawal_reason || null, req.params.id, req.user.id
    ]);

    if (!result.rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

module.exports = router;
