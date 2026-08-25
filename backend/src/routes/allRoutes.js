// ============================================================
// TENNIS COACHING OS — REMAINING ROUTE HANDLERS
// Split into separate files in production; combined here for clarity
// ============================================================

const express = require('express');

// ─── ALERTS ROUTER ────────────────────────────────────────────────────────────
const alertsRouter = express.Router();
const alertService = require('../services/alertService');
const { authenticate } = require('../middleware/auth');

alertsRouter.get('/:user_id', authenticate, async (req, res) => {
  try {
    const alerts = await alertService.getUserAlerts(req.params.user_id);
    res.json(alerts);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch alerts' }); }
});

alertsRouter.get('/urgent/:user_id', authenticate, async (req, res) => {
  try {
    const { query } = require('../config/database');
    const result = await query(
      `SELECT * FROM alerts WHERE user_id = $1 AND severity = 'urgent' AND resolved_at IS NULL ORDER BY created_at DESC`,
      [req.params.user_id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch urgent alerts' }); }
});

alertsRouter.put('/:id/resolve', authenticate, async (req, res) => {
  try {
    const alert = await alertService.resolveAlert(req.params.id, req.user.id, req.body.resolution_note);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    res.json(alert);
  } catch (err) { res.status(500).json({ error: 'Failed to resolve alert' }); }
});

alertsRouter.put('/:id/read', authenticate, async (req, res) => {
  try {
    const { query } = require('../config/database');
    await query('UPDATE alerts SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Marked as read' });
  } catch (err) { res.status(500).json({ error: 'Failed to mark alert' }); }
});

// ─── AI ASSISTANT ROUTER ──────────────────────────────────────────────────────
const aiRouter = express.Router();
const aiService = require('../services/aiService');
const { query: dbQuery } = require('../config/database');

aiRouter.post('/query', authenticate, async (req, res) => {
  const { query: userQuery, context = {} } = req.body;
  if (!userQuery?.trim()) return res.status(400).json({ error: 'Query is required' });

  try {
    // Auto-enrich context with coach profile
    if (req.user.role === 'coach') {
      const profileResult = await dbQuery(
        'SELECT archetype, philosophy, environment_types, pricing_model FROM coach_profiles WHERE user_id = $1',
        [req.user.id]
      );
      if (profileResult.rows.length) context.coachProfile = profileResult.rows[0];
    }

    const result = await aiService.queryAI(req.user.id, userQuery, context);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'AI query failed. Please try again.' });
  }
});

aiRouter.get('/history/:user_id', authenticate, async (req, res) => {
  try {
    const history = await aiService.getHistory(req.params.user_id, parseInt(req.query.limit) || 20);
    res.json(history);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch AI history' }); }
});

aiRouter.post('/session-plan', authenticate, async (req, res) => {
  const { player_id, session_config = {} } = req.body;
  try {
    const [profileResult, playerResult] = await Promise.all([
      dbQuery('SELECT * FROM coach_profiles WHERE user_id = $1', [req.user.id]),
      player_id ? dbQuery('SELECT * FROM players WHERE id = $1', [player_id]) : Promise.resolve({ rows: [{}] }),
    ]);
    const plan = await aiService.generateSessionPlan(
      profileResult.rows[0] || {},
      playerResult.rows[0] || {},
      session_config
    );
    res.json({ plan });
  } catch (err) { res.status(500).json({ error: 'Failed to generate session plan' }); }
});

aiRouter.put('/history/:log_id/helpful', authenticate, async (req, res) => {
  try {
    await aiService.markHelpful(req.params.log_id, req.user.id, req.body.was_helpful);
    res.json({ message: 'Feedback recorded' });
  } catch (err) { res.status(500).json({ error: 'Failed to record feedback' }); }
});

// ─── BUSINESS METRICS ROUTER ──────────────────────────────────────────────────
const businessRouter = express.Router();
const retentionService = require('../services/retentionService');

businessRouter.get('/:coach_id', authenticate, async (req, res) => {
  try {
    const result = await dbQuery(
      'SELECT * FROM business_metrics WHERE coach_id = $1 ORDER BY period_start DESC LIMIT 12',
      [req.params.coach_id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch business metrics' }); }
});

businessRouter.post('/', authenticate, async (req, res) => {
  const { period_start, period_end, revenue, player_count, sessions_delivered, notes } = req.body;
  try {
    const result = await dbQuery(`
      INSERT INTO business_metrics (coach_id, period_start, period_end, revenue, player_count, sessions_delivered, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [req.user.id, period_start, period_end, revenue || 0, player_count || 0, sessions_delivered || 0, notes || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to save metrics' }); }
});

businessRouter.get('/:coach_id/dashboard-summary', authenticate, async (req, res) => {
  const coachId = req.params.coach_id;
  if (req.user.role === 'coach' && coachId !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    const result = await dbQuery(`
      SELECT
        (SELECT COUNT(*)::int FROM players WHERE coach_id = $1 AND is_active = true) AS active_players,
        (SELECT COUNT(*)::int FROM sessions
          WHERE coach_id = $1
            AND is_completed = true
            AND session_date >= date_trunc('month', CURRENT_DATE)) AS sessions_this_month,
        (SELECT ROUND(AVG(rm.engagement_score)::numeric, 1)
           FROM retention_metrics rm
          WHERE rm.coach_id = $1
            AND rm.recorded_date >= CURRENT_DATE - INTERVAL '30 days') AS avg_retention_score,
        (SELECT COUNT(DISTINCT p.id)::int FROM players p
          WHERE p.coach_id = $1
            AND p.is_active = true
            AND (p.burnout_risk_level IN ('high', 'critical') OR p.dropout_risk_level IN ('high', 'critical'))) AS at_risk_count,
        COALESCE((SELECT SUM(amount) FROM income_records
          WHERE coach_id = $1 AND received_date >= date_trunc('month', CURRENT_DATE)::date), 0)::numeric(12,2) AS monthly_revenue,
        COALESCE((SELECT SUM(amount) FROM income_records
          WHERE coach_id = $1
            AND received_date >= (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date
            AND received_date < date_trunc('month', CURRENT_DATE)::date), 0)::numeric(12,2) AS previous_month_revenue
    `, [coachId]);
    const summary = result.rows[0];
    const currentRevenue = Number(summary.monthly_revenue || 0);
    const previousRevenue = Number(summary.previous_month_revenue || 0);
    res.json({
      ...summary,
      monthly_revenue: currentRevenue,
      revenue_trend: previousRevenue > 0 ? Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 1000) / 10 : null,
    });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch dashboard summary' }); }
});

businessRouter.get('/:coach_id/retention-analytics', authenticate, async (req, res) => {
  try {
    const analytics = await retentionService.getCoachRetentionAnalytics(req.params.coach_id);
    res.json(analytics);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch retention analytics' }); }
});

businessRouter.get('/:coach_id/ai-insight', authenticate, async (req, res) => {
  try {
    const [profileRes, metricsRes] = await Promise.all([
      dbQuery('SELECT * FROM coach_profiles WHERE user_id = $1', [req.params.coach_id]),
      dbQuery(`
        SELECT AVG(revenue) as revenue, AVG(player_count) as player_count,
               AVG(retention_rate) as retention_rate, AVG(churn_rate) as churn_rate
        FROM business_metrics WHERE coach_id = $1 AND period_start >= NOW() - INTERVAL '90 days'
      `, [req.params.coach_id]),
    ]);

    const players = await dbQuery(
      'SELECT AVG(enjoyment_score) as avg_enjoyment FROM players WHERE coach_id = $1 AND is_active = true',
      [req.params.coach_id]
    );

    const insight = await aiService.generateBusinessInsight(
      profileRes.rows[0] || {},
      { ...metricsRes.rows[0], avg_enjoyment: players.rows[0]?.avg_enjoyment }
    );
    res.json({ insight });
  } catch (err) { res.status(500).json({ error: 'Failed to generate insight' }); }
});

// ─── COMMUNITY KNOWLEDGE ROUTER ───────────────────────────────────────────────
const communityRouter = express.Router();

communityRouter.get('/', authenticate, async (req, res) => {
  const { environment_type, resource_level, player_type, search, limit = 20, offset = 0 } = req.query;
  try {
    let sql = `SELECT ck.*, u.name as author_name,
      COALESCE(AVG(cr.rating), 0) as avg_rating, COUNT(cr.id) as rating_count
      FROM community_knowledge ck
      LEFT JOIN users u ON u.id = ck.coach_id
      LEFT JOIN community_ratings cr ON cr.knowledge_id = ck.id
      WHERE ck.is_published = true`;
    const params = [];
    let idx = 1;

    if (environment_type) { sql += ` AND $${idx++} = ANY(ck.environment_type::text[])`; params.push(environment_type); }
    if (resource_level) { sql += ` AND ck.resource_level = $${idx++}`; params.push(resource_level); }
    if (player_type) { sql += ` AND ck.player_type = $${idx++}`; params.push(player_type); }
    if (search) {
      sql += ` AND to_tsvector('english', ck.title || ' ' || ck.content) @@ plainto_tsquery('english', $${idx++})`;
      params.push(search);
    }
    sql += ` GROUP BY ck.id, u.name ORDER BY avg_rating DESC, ck.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await dbQuery(sql, params);
    res.json({ items: result.rows });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch community knowledge' }); }
});

communityRouter.post('/', authenticate, async (req, res) => {
  const { title, content, environment_type, resource_level, player_type, tags, language = 'en-GB' } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
  try {
    const result = await dbQuery(`
      INSERT INTO community_knowledge (coach_id, title, content, environment_type, resource_level, player_type, tags, language)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [req.user.id, title, content,
        environment_type ? `{${environment_type}}` : null,
        resource_level || null, player_type || null,
        tags ? `{${tags.map(t => `"${t}"`).join(',')}}` : null, language]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create post' }); }
});

communityRouter.post('/:id/rating', authenticate, async (req, res) => {
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
  try {
    await dbQuery(`
      INSERT INTO community_ratings (knowledge_id, user_id, rating, comment)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (knowledge_id, user_id) DO UPDATE SET rating = $3, comment = $4
    `, [req.params.id, req.user.id, rating, comment || null]);
    res.json({ message: 'Rating saved' });
  } catch (err) { res.status(500).json({ error: 'Failed to save rating' }); }
});

// ─── CHECKLISTS ROUTER ────────────────────────────────────────────────────────
const checklistsRouter = express.Router();

checklistsRouter.get('/', authenticate, async (req, res) => {
  const { type, player_id } = req.query;
  try {
    let sql = 'SELECT * FROM checklists WHERE coach_id = $1';
    const params = [req.user.id];
    let idx = 2;
    if (type) { sql += ` AND checklist_type = $${idx++}`; params.push(type); }
    if (player_id) { sql += ` AND player_id = $${idx++}`; params.push(player_id); }
    sql += ' ORDER BY created_at DESC';
    const result = await dbQuery(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch checklists' }); }
});

checklistsRouter.post('/', authenticate, async (req, res) => {
  const { player_id, session_id, checklist_type, title, items = [] } = req.body;
  if (!checklist_type) return res.status(400).json({ error: 'Checklist type required' });
  try {
    const result = await dbQuery(`
      INSERT INTO checklists (coach_id, player_id, session_id, checklist_type, title, items)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [req.user.id, player_id || null, session_id || null, checklist_type, title || null, JSON.stringify(items)]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create checklist' }); }
});

checklistsRouter.post('/:id/complete', authenticate, async (req, res) => {
  const { item_id, completed } = req.body;
  try {
    const existing = await dbQuery('SELECT items FROM checklists WHERE id = $1 AND coach_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Checklist not found' });

    const items = existing.rows[0].items;
    const updated = items.map(item =>
      item.id === item_id ? { ...item, completed, completed_at: completed ? new Date().toISOString() : null } : item
    );
    const completionPct = (updated.filter(i => i.completed).length / updated.length) * 100;

    const result = await dbQuery(`
      UPDATE checklists SET items = $1, completion_status = $2,
        completed_at = CASE WHEN $2 = 100 THEN NOW() ELSE NULL END
      WHERE id = $3 RETURNING *
    `, [JSON.stringify(updated), completionPct, req.params.id]);

    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update checklist item' }); }
});

// ─── USERS & COACH PROFILES ROUTER ───────────────────────────────────────────
const usersRouter = express.Router();

usersRouter.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await dbQuery(
      'SELECT id, email, name, role, phone, avatar_url, language_pref, timezone, last_login_at, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch user' }); }
});

usersRouter.put('/:id', authenticate, async (req, res) => {
  if (req.user.id !== req.params.id && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { name, phone, avatar_url, language_pref, timezone } = req.body;
  try {
    const result = await dbQuery(`
      UPDATE users SET
        name = COALESCE($1, name), phone = COALESCE($2, phone),
        avatar_url = COALESCE($3, avatar_url), language_pref = COALESCE($4, language_pref),
        timezone = COALESCE($5, timezone)
      WHERE id = $6 RETURNING id, email, name, role, phone, avatar_url, language_pref, timezone
    `, [name, phone, avatar_url, language_pref, timezone, req.params.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update user' }); }
});

usersRouter.get('/coach-profiles/:user_id', authenticate, async (req, res) => {
  try {
    const result = await dbQuery('SELECT * FROM coach_profiles WHERE user_id = $1', [req.params.user_id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch profile' }); }
});

usersRouter.put('/coach-profiles/:user_id', authenticate, async (req, res) => {
  if (req.user.id !== req.params.user_id && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  const allowed = ['archetype','philosophy','signature_style','development_pathway_level',
    'environment_types','years_experience','certifications','pricing_model','hourly_rate',
    'monthly_target_revenue','positioning_niche','is_onboarded'];
  try {
    const updates = [];
    const values = [];
    let idx = 1;
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        values.push(req.body[field]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No valid fields' });
    values.push(req.params.user_id);
    const result = await dbQuery(
      `UPDATE coach_profiles SET ${updates.join(', ')} WHERE user_id = $${idx} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update profile' }); }
});

// ─── RULES & WORKFLOWS ROUTER (Admin) ────────────────────────────────────────
const adminRouter = express.Router();
const { authenticate: auth, authorize } = require('../middleware/auth');
const rulesEngine = require('../rules/rulesEngine');

adminRouter.get('/rules', auth, authorize('super_admin', 'federation_admin'), async (req, res) => {
  try {
    const rules = await rulesEngine.getAllRules(req.query.category);
    res.json(rules);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch rules' }); }
});

adminRouter.post('/rules', auth, authorize('super_admin'), async (req, res) => {
  try {
    const rule = await rulesEngine.createRule({ ...req.body, userId: req.user.id });
    res.status(201).json(rule);
  } catch (err) { res.status(500).json({ error: 'Failed to create rule' }); }
});

adminRouter.get('/audit-logs', auth, authorize('super_admin', 'federation_admin'), async (req, res) => {
  try {
    const result = await dbQuery(
      `SELECT * FROM audit_logs WHERE ($1::uuid IS NULL OR user_id = $1) ORDER BY created_at DESC LIMIT $2`,
      [req.query.user_id || null, parseInt(req.query.limit) || 100]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch audit logs' }); }
});

adminRouter.get('/workflows', auth, authorize('super_admin', 'federation_admin'), async (req, res) => {
  try {
    const result = await dbQuery('SELECT * FROM workflows WHERE is_active = true ORDER BY category, name');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch workflows' }); }
});

module.exports = { alertsRouter, aiRouter, businessRouter, communityRouter, checklistsRouter, usersRouter, adminRouter };
