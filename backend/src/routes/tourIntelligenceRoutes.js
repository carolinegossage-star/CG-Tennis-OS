// ============================================================
// CG Tennis OS™ — TOUR INTELLIGENCE ROUTES
// "Apex Tour Intelligence™" (free) + "Apex Coach AI Suite™" (pro, gated)
// © CG Tennis Academies. All Rights Reserved.
// ============================================================

const express = require('express');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const tourDataService = require('../services/tourDataService');
const tourCurationService = require('../services/tourCurationService');
const apexCoachService = require('../services/apexCoachService');
const logger = require('../utils/logger');

// ─── PUBLIC FREE LAYER — no login required ────────────────────────────────────
const publicTourRouter = express.Router();

// GET /tour/events — map + grid data, current week
publicTourRouter.get('/events', async (req, res) => {
  try {
    const events = await tourDataService.getCurrentWeekSnapshot({
      tier: req.query.tier,
      surface: req.query.surface,
      liveOnly: req.query.live_only === 'true',
    });
    res.json({ events });
  } catch (err) {
    logger.error('Public tour events error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch tour events' });
  }
});

// GET /tour/feed — the "why it matters" published feed (the moat)
publicTourRouter.get('/feed', async (req, res) => {
  try {
    const feed = await tourCurationService.getPublishedFeed(parseInt(req.query.limit) || 20);
    res.json({ feed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch curation feed' });
  }
});

// POST /tour/feed/:id/view — track engagement (called once per page view)
publicTourRouter.post('/feed/:id/view', async (req, res) => {
  try {
    await tourCurationService.trackView(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to track view' });
  }
});

// POST /tour/feed/:id/share — track engagement
publicTourRouter.post('/feed/:id/share', async (req, res) => {
  try {
    await tourCurationService.trackShare(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to track share' });
  }
});

// GET /tour/events/:id — single event detail (for map pin click)
publicTourRouter.get('/events/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT te.*,
        (SELECT json_agg(tm.*) FROM tour_matches tm WHERE tm.event_id = te.id ORDER BY tm.scheduled_time) as matches,
        (SELECT json_agg(tcn.*) FROM tour_curation_notes tcn WHERE tcn.event_id = te.id AND tcn.is_published = true) as curation_notes
      FROM tour_events te WHERE te.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Event not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// POST /tour/watchlist — anonymous or logged-in watchlist (free engagement hook)
publicTourRouter.post('/watchlist', async (req, res) => {
  const { session_token, watch_type, watch_value, user_id } = req.body;
  if (!session_token || !watch_type || !watch_value) {
    return res.status(400).json({ error: 'session_token, watch_type and watch_value are required' });
  }
  try {
    const result = await query(`
      INSERT INTO public_watchlist_items (session_token, user_id, watch_type, watch_value)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [session_token, user_id || null, watch_type, watch_value]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

// ─── CAROLINE'S CURATION REVIEW QUEUE — authenticated, admin only ────────────
const curationAdminRouter = express.Router();

// GET /tour-admin/review-queue
curationAdminRouter.get('/review-queue', authenticate, authorize('super_admin', 'coach'), async (req, res) => {
  try {
    const queue = await tourCurationService.getReviewQueue();
    res.json({ queue });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch review queue' });
  }
});

// POST /tour-admin/draft-notes — manually trigger AI drafting (also runs on cron)
curationAdminRouter.post('/draft-notes', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const drafted = await tourCurationService.draftDailyNotes(req.body.max_notes || 10);
    res.json({ drafted, count: drafted.length });
  } catch (err) {
    res.status(500).json({ error: 'Drafting failed' });
  }
});

// PUT /tour-admin/notes/:id/review — approve, edit, or reject a draft
curationAdminRouter.put('/notes/:id/review', authenticate, authorize('super_admin', 'coach'), async (req, res) => {
  const { decision, edited_commentary, edited_headline } = req.body;
  if (!['approve', 'edit', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approve, edit, or reject' });
  }
  try {
    const note = await tourCurationService.reviewNote(
      req.params.id, req.user.id, decision, edited_commentary, edited_headline
    );
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Review action failed' });
  }
});

// POST /tour-admin/sync-now — manually trigger a data sync (also runs on cron)
curationAdminRouter.post('/sync-now', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const result = await tourDataService.runSyncCycle();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Sync failed' });
  }
});

// ─── APEX COACH AI SUITE™ — PRO TIER, GATED ──────────────────────────────────
const apexCoachRouter = express.Router();

// Subscription gate middleware
const requireApexSubscription = async (req, res, next) => {
  const hasAccess = await apexCoachService.requiresActiveSubscription(req.user.id);
  if (!hasAccess) {
    return res.status(402).json({
      error: 'Apex Coach AI Suite™ subscription required',
      code: 'SUBSCRIPTION_REQUIRED',
      upgradeUrl: '/business/upgrade',
    });
  }
  next();
};

apexCoachRouter.use(authenticate, requireApexSubscription);

// POST /apex-coach/draw-analysis
apexCoachRouter.post('/draw-analysis', async (req, res) => {
  const { player_id, style_profile, event_context } = req.body;
  try {
    const playerResult = player_id ? await query('SELECT * FROM players WHERE id = $1', [player_id]) : { rows: [{}] };
    const analysis = await apexCoachService.generateDrawAnalysis(
      req.user.id, playerResult.rows[0], style_profile || {}, event_context || ''
    );
    res.status(201).json(analysis);
  } catch (err) {
    res.status(500).json({ error: 'Draw analysis generation failed' });
  }
});

// POST /apex-coach/session-plan-link
apexCoachRouter.post('/session-plan-link', async (req, res) => {
  const { player_id, style_profile, tour_pattern } = req.body;
  try {
    const playerResult = player_id ? await query('SELECT * FROM players WHERE id = $1', [player_id]) : { rows: [{}] };
    const analysis = await apexCoachService.generateSessionPlanLink(
      req.user.id, playerResult.rows[0], style_profile || {}, tour_pattern || ''
    );
    res.status(201).json(analysis);
  } catch (err) {
    res.status(500).json({ error: 'Session plan link generation failed' });
  }
});

// POST /apex-coach/parent-comms
apexCoachRouter.post('/parent-comms', async (req, res) => {
  const { player_id, scenario } = req.body;
  try {
    const playerResult = player_id ? await query('SELECT * FROM players WHERE id = $1', [player_id]) : { rows: [{}] };
    const analysis = await apexCoachService.generateParentCommsTemplate(
      req.user.id, playerResult.rows[0], scenario || ''
    );
    res.status(201).json(analysis);
  } catch (err) {
    res.status(500).json({ error: 'Parent comms generation failed' });
  }
});

// POST /apex-coach/style-matchup
apexCoachRouter.post('/style-matchup', async (req, res) => {
  const { player_id, style_profile, opponent_style_note } = req.body;
  try {
    const playerResult = player_id ? await query('SELECT * FROM players WHERE id = $1', [player_id]) : { rows: [{}] };
    const analysis = await apexCoachService.generateStyleMatchupReport(
      req.user.id, playerResult.rows[0], style_profile || {}, opponent_style_note || ''
    );
    res.status(201).json(analysis);
  } catch (err) {
    res.status(500).json({ error: 'Style matchup generation failed' });
  }
});

// GET /apex-coach/history
apexCoachRouter.get('/history', async (req, res) => {
  try {
    const history = await apexCoachService.getHistory(req.user.id, parseInt(req.query.limit) || 20);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = { publicTourRouter, curationAdminRouter, apexCoachRouter };
