const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const retentionFlagService = require('../services/retentionFlagService');
const parentDraftService = require('../services/parentDraftService');
const standbyService = require('../services/standbyService');

const coachOnly = [authenticate, authorize('coach', 'academy_director', 'super_admin')];

// GET /coach/retention-flags
router.get('/retention-flags', ...coachOnly, async (req, res) => {
  try {
    const coachId = req.user.role === 'super_admin' && req.query.coach_id
      ? req.query.coach_id
      : req.user.id;
    res.json({ flags: await retentionFlagService.getCoachFlags(coachId) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch retention flags' });
  }
});

// POST /coach/retention-flags/:id/dismiss
router.post('/retention-flags/:id/dismiss', ...coachOnly, async (req, res) => {
  try {
    const flag = await retentionFlagService.dismissFlag(req.params.id, req.user.id);
    if (!flag) return res.status(404).json({ error: 'Retention flag not found' });
    res.json(flag);
  } catch (err) {
    res.status(500).json({ error: 'Failed to dismiss retention flag' });
  }
});

// POST /coach/retention-flags/:id/resolve
router.post('/retention-flags/:id/resolve', ...coachOnly, async (req, res) => {
  try {
    const flag = await retentionFlagService.resolveFlag(req.params.id, req.user.id);
    if (!flag) return res.status(404).json({ error: 'Retention flag not found' });
    res.json(flag);
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve retention flag' });
  }
});

// POST /coach/parent-draft — generates a draft only; it never sends.
router.post('/parent-draft', ...coachOnly, async (req, res) => {
  const { player_id, tags = [], include_retention_context = false } = req.body || {};
  if (!player_id || !Array.isArray(tags)) {
    return res.status(400).json({ error: 'player_id and tags array are required' });
  }
  try {
    const draft = await parentDraftService.createDraft({
      coachId: req.user.id,
      playerId: player_id,
      tags,
      includeRetentionContext: include_retention_context === true,
    });
    res.status(201).json(draft);
  } catch (err) {
    const status = err.code === 'FEATURE_DISABLED' ? 403 : err.code === 'PLAYER_NOT_FOUND' ? 404 : 500;
    res.status(status).json({ error: err.message || 'Failed to generate parent draft', code: err.code });
  }
});

// GET /coach/parent-draft/:id
router.get('/parent-draft/:id', ...coachOnly, async (req, res) => {
  try {
    const draft = await parentDraftService.getDraftContent(req.params.id, req.user.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    res.json(draft);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch draft' });
  }
});

// POST /coach/parent-draft/:id/approve — records approval/copy intent; never sends.
router.post('/parent-draft/:id/approve', ...coachOnly, async (req, res) => {
  try {
    const draft = await parentDraftService.approveDraft(req.params.id, req.user.id);
    if (!draft) return res.status(404).json({ error: 'Pending draft not found' });
    res.json(draft);
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve draft' });
  }
});

// DELETE /coach/parent-draft/:id — abandoned drafts are hard-deleted.
router.delete('/parent-draft/:id', ...coachOnly, async (req, res) => {
  try {
    const deleted = await parentDraftService.deleteDraft(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'Pending draft not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

// GET /coach/players/:playerId/drafts/export — subject-access export.
router.get('/players/:playerId/drafts/export', ...coachOnly, async (req, res) => {
  try {
    res.json({ drafts: await parentDraftService.exportPlayerDrafts(req.params.playerId, req.user.id) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to export player drafts' });
  }
});

// GET /coach/session/:id/standby — inspect the configured queue.
router.get('/session/:id/standby', ...coachOnly, async (req, res) => {
  try {
    res.json({ queue: await standbyService.listQueue(req.params.id, req.user.id) });
  } catch (err) {
    const status = err.code === 'SESSION_NOT_FOUND' ? 404 : 500;
    res.status(status).json({ error: err.message || 'Failed to fetch standby queue', code: err.code });
  }
});

// POST /coach/session/:id/standby — add a player to the queue.
router.post('/session/:id/standby', ...coachOnly, async (req, res) => {
  if (!req.body?.player_id) return res.status(400).json({ error: 'player_id is required' });
  try {
    const queueEntry = await standbyService.addToQueue(req.params.id, req.user.id, req.body.player_id);
    if (!queueEntry) return res.status(409).json({ error: 'Player is already on this standby list' });
    res.status(201).json(queueEntry);
  } catch (err) {
    const status = err.code === 'FEATURE_DISABLED' ? 403 : ['SESSION_NOT_FOUND', 'PLAYER_NOT_FOUND'].includes(err.code) ? 404 : 500;
    res.status(status).json({ error: err.message || 'Failed to add standby player', code: err.code });
  }
});

// POST /coach/session/:id/notify-standby — fixed template; no background send.
router.post('/session/:id/notify-standby', ...coachOnly, async (req, res) => {
  try {
    const notifications = await standbyService.notifyNext(
      req.params.id,
      req.user.id,
      req.body?.scope === 'whole_list'
    );
    res.json({ notifications });
  } catch (err) {
    const status = err.code === 'FEATURE_DISABLED' ? 403 : err.code === 'SESSION_NOT_FOUND' ? 404 : 500;
    res.status(status).json({ error: err.message || 'Failed to notify standby list', code: err.code });
  }
});

// POST /standby/:id/claim — token claim is atomic inside a transaction.
router.post('/standby/:id/claim', async (req, res) => {
  try {
    const claimed = await standbyService.claim(req.params.id);
    if (!claimed) return res.status(409).json({ error: 'This standby place is no longer available' });
    res.json(claimed);
  } catch (err) {
    res.status(500).json({ error: 'Failed to claim standby place' });
  }
});

// GET /coach/feature-settings
router.get('/feature-settings', ...coachOnly, async (req, res) => {
  try {
    const result = await query('SELECT feature_flags FROM coach_profiles WHERE user_id = $1', [req.user.id]);
    res.json({ feature_flags: result.rows[0]?.feature_flags || {} });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch feature settings' });
  }
});

// PATCH /coach/feature-settings — settings are intentionally coach-scoped.
router.patch('/feature-settings', ...coachOnly, async (req, res) => {
  const { retention_risk_early_warning } = req.body || {};
  if (typeof retention_risk_early_warning !== 'boolean') {
    return res.status(400).json({ error: 'retention_risk_early_warning must be boolean' });
  }
  try {
    const result = await query(
      `UPDATE coach_profiles
          SET feature_flags = jsonb_set(COALESCE(feature_flags, '{}'::jsonb), '{retention_risk_early_warning}', $1::jsonb, true),
              updated_at = NOW()
        WHERE user_id = $2
      RETURNING feature_flags`,
      [JSON.stringify(retention_risk_early_warning), req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Coach profile not found' });
    res.json({ feature_flags: result.rows[0].feature_flags });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update feature settings' });
  }
});

module.exports = router;
