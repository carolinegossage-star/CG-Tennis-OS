const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { query, cache } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const reflectiveService = require('../services/reflectiveService');
const retentionService = require('../services/retentionService');
const logger = require('../utils/logger');
const { validateProgrammeIds } = require('../services/programmeAssignmentService');

// GET /sessions — coach's sessions
router.get('/', authenticate, async (req, res) => {
  const { player_id, date_from, date_to, completed, limit = 20, offset = 0 } = req.query;
  const coachId = req.user.role === 'super_admin' ? req.query.coach_id : req.user.id;

  try {
    let sql = `
      SELECT s.*,
        p.name as player_name,
        p.burnout_risk_level, p.dropout_risk_level,
        cp.name AS programme_name, cp.programme_type
      FROM sessions s
      LEFT JOIN players p ON p.id = s.player_id
      LEFT JOIN coaching_programmes cp ON cp.id = s.programme_id
      WHERE s.coach_id = $1
    `;
    const params = [coachId];
    let idx = 2;

    if (player_id) { sql += ` AND s.player_id = $${idx++}`; params.push(player_id); }
    if (date_from)  { sql += ` AND s.session_date >= $${idx++}`; params.push(date_from); }
    if (date_to)    { sql += ` AND s.session_date <= $${idx++}`; params.push(date_to); }
    if (completed !== undefined) { sql += ` AND s.is_completed = $${idx++}`; params.push(completed === 'true'); }

    sql += ` ORDER BY s.session_date DESC, s.start_time DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);
    res.json({ sessions: result.rows, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    logger.error('Get sessions error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /sessions/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT s.*, p.name as player_name, p.id as player_id,
        cp.name AS programme_name, cp.programme_type
      FROM sessions s
      LEFT JOIN players p ON p.id = s.player_id
      LEFT JOIN coaching_programmes cp ON cp.id = s.programme_id
      WHERE s.id = $1 AND s.coach_id = $2
    `, [req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Session not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// POST /sessions
router.post('/', authenticate, [
  body('session_date').isISO8601(),
  body('duration_minutes').optional().isInt({ min: 1, max: 480 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    player_id, player_group, is_group_session = false, programme_id,
    session_date, start_time, duration_minutes, environment_type, location,
    session_plan, frameworks_used
  } = req.body;

  try {
    let programme = null;
    if (programme_id) {
      await validateProgrammeIds([programme_id], req.user.id);
      const programmeResult = await query(
        'SELECT id, name, programme_type FROM coaching_programmes WHERE id = $1 AND coach_id = $2 AND is_active = true',
        [programme_id, req.user.id],
      );
      programme = programmeResult.rows[0];
    }
    const resolvedSessionPlan = {
      ...(session_plan || {}),
      ...(programme ? {
        programme_id: programme.id,
        programme_name: programme.name,
        programme_type: programme.programme_type,
        // Legacy consumers continue to read this key. Pair is represented as
        // group in the legacy vocabulary; the structured Programme retains pair.
        session_type: programme.programme_type === 'pair' ? 'group' : programme.programme_type,
      } : {}),
    };

    const result = await query(`
      INSERT INTO sessions (
        coach_id, player_id, player_group, is_group_session, programme_id,
        session_date, start_time, duration_minutes, environment_type, location,
        session_plan, frameworks_used
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      req.user.id, player_id || null,
      Array.isArray(player_group) && player_group.length ? `{${player_group.join(',')}}` : null,
      programme ? programme.programme_type !== 'individual' : is_group_session,
      programme?.id || null, session_date, start_time || null,
      duration_minutes || null, environment_type || null, location || null,
      JSON.stringify(resolvedSessionPlan),
      frameworks_used ? `{${frameworks_used.map(f => `"${f}"`).join(',')}}` : null,
    ]);

    logger.info('Session created', { coachId: req.user.id, sessionId: result.rows[0].id, programmeId: programme?.id || null });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Create session error', { error: err.message });
    res.status(err.code === 'INVALID_PROGRAMME_ASSIGNMENTS' ? 400 : 500).json({ error: err.message || 'Failed to create session' });
  }
});

// PUT /sessions/:id
router.put('/:id', authenticate, async (req, res) => {
  const allowedFields = [
    'player_id', 'player_group', 'is_group_session', 'session_date', 'start_time',
    'duration_minutes', 'environment_type', 'location', 'session_plan', 'frameworks_used',
    'is_completed', 'cancelled_reason', 'enjoyment_score', 'engagement_score', 'programme_id',
  ];
  try {
    const existing = await query('SELECT * FROM sessions WHERE id = $1 AND coach_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Session not found' });

    let programme = null;
    const isProgrammeChange = Object.prototype.hasOwnProperty.call(req.body, 'programme_id');
    if (isProgrammeChange && req.body.programme_id) {
      await validateProgrammeIds([req.body.programme_id], req.user.id);
      const programmeResult = await query(
        'SELECT id, name, programme_type FROM coaching_programmes WHERE id = $1 AND coach_id = $2 AND is_active = true',
        [req.body.programme_id, req.user.id],
      );
      programme = programmeResult.rows[0];
    }

    const updates = [];
    const values = [];
    let idx = 1;
    const mergedSessionPlan = {
      ...(existing.rows[0].session_plan || {}),
      ...(req.body.session_plan || {}),
      ...(programme ? {
        programme_id: programme.id,
        programme_name: programme.name,
        programme_type: programme.programme_type,
        session_type: programme.programme_type === 'pair' ? 'group' : programme.programme_type,
      } : {}),
    };
    if (isProgrammeChange && !programme) {
      delete mergedSessionPlan.programme_id;
      delete mergedSessionPlan.programme_name;
      delete mergedSessionPlan.programme_type;
    }

    for (const field of allowedFields) {
      if (field === 'session_plan' && (req.body.session_plan !== undefined || isProgrammeChange)) {
        updates.push(`${field} = $${idx++}`);
        values.push(JSON.stringify(mergedSessionPlan));
      } else if (field === 'programme_id' && isProgrammeChange) {
        updates.push(`${field} = $${idx++}`);
        values.push(programme?.id || null);
      } else if (field === 'is_group_session' && programme) {
        updates.push(`${field} = $${idx++}`);
        values.push(programme.programme_type !== 'individual');
      } else if (!['session_plan', 'programme_id', 'is_group_session'].includes(field) && req.body[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        values.push(req.body[field]);
      } else if (field === 'is_group_session' && req.body[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        values.push(req.body[field]);
      }
    }

    if (!updates.length) return res.status(400).json({ error: 'No valid fields' });
    values.push(req.params.id, req.user.id);

    const result = await query(
      `UPDATE sessions SET ${updates.join(', ')} WHERE id = $${idx} AND coach_id = $${idx + 1} RETURNING *`,
      values,
    );
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Update session error', { error: err.message });
    res.status(err.code === 'INVALID_PROGRAMME_ASSIGNMENTS' ? 400 : 500).json({ error: err.message || 'Failed to update session' });
  }
});

// POST /sessions/:id/reflection — log reflection and trigger AI summary
router.post('/:id/reflection', authenticate, async (req, res) => {
  const { reflection_text, reflection_voice_url, reflection_checklist, enjoyment_score, engagement_score } = req.body;

  try {
    const result = await query(`
      UPDATE sessions SET
        reflection_text = $1,
        reflection_voice_url = $2,
        reflection_checklist = $3,
        enjoyment_score = $4,
        engagement_score = $5,
        is_completed = true
      WHERE id = $6 AND coach_id = $7
      RETURNING *
    `, [
      reflection_text || null, reflection_voice_url || null,
      reflection_checklist ? JSON.stringify(reflection_checklist) : '{}',
      enjoyment_score || null, engagement_score || null,
      req.params.id, req.user.id
    ]);

    if (!result.rows.length) return res.status(404).json({ error: 'Session not found' });
    const session = result.rows[0];

    // Generate AI reflection summary (non-blocking)
    reflectiveService.generateReflectionSummary(session).then(async (summary) => {
      await query('UPDATE sessions SET ai_reflection_summary = $1 WHERE id = $2', [summary, session.id]);
    }).catch(e => logger.warn('AI reflection failed', { error: e.message }));

    // Update player retention metrics (non-blocking)
    if (session.player_id) {
      retentionService.recordSessionMetrics(session).catch(e =>
        logger.warn('Retention update failed', { error: e.message })
      );
    }

    res.json({ session, message: 'Reflection saved. AI summary generating...' });
  } catch (err) {
    logger.error('Reflection error', { error: err.message });
    res.status(500).json({ error: 'Failed to save reflection' });
  }
});

// POST /sessions/:id/debrief
router.post('/:id/debrief', authenticate, async (req, res) => {
  const { what_went_well, areas_for_improvement, player_response, marginal_gains_tracked, next_session_focus } = req.body;

  const debriefData = { what_went_well, areas_for_improvement, player_response, next_session_focus };

  try {
    const result = await query(`
      UPDATE sessions SET
        debrief_data = $1,
        marginal_gains_tracked = $2
      WHERE id = $3 AND coach_id = $4
      RETURNING *
    `, [
      JSON.stringify(debriefData),
      marginal_gains_tracked ? JSON.stringify(marginal_gains_tracked) : '[]',
      req.params.id, req.user.id
    ]);

    if (!result.rows.length) return res.status(404).json({ error: 'Session not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save debrief' });
  }
});

// GET /marginal-gains/:coach_id — aggregated marginal gains over time
router.get('/marginal-gains/:coach_id', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        s.session_date,
        s.player_id,
        p.name as player_name,
        jsonb_array_elements(s.marginal_gains_tracked) as gain_item
      FROM sessions s
      LEFT JOIN players p ON p.id = s.player_id
      WHERE s.coach_id = $1
        AND s.marginal_gains_tracked != '[]'
        AND s.session_date >= NOW() - INTERVAL '90 days'
      ORDER BY s.session_date DESC
    `, [req.params.coach_id]);

    res.json({ marginal_gains: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch marginal gains' });
  }
});

module.exports = router;
