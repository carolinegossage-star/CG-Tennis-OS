// ============================================================
// CG Tennis OS™ — TOURNAMENT MATCHES ROUTES
// Daily order of play, live status, score entry, scheduling, history.
// © CG Tennis Academies. All Rights Reserved.
// ============================================================
//
// Mounted at /tournament-matches. This is the route layer that makes
// the Tournament area a genuine live engine — every write here goes
// through tournamentMatchService, which logs to tournament_match_history
// before updating the match row (see that file for the full reasoning).
//
// ROUTE ORDER MATTERS: Express matches routes top-to-bottom, and /:id
// would otherwise swallow literal paths like /order-of-play (treating
// "order-of-play" as if it were a match ID, then failing UUID
// validation). All literal-path GET routes are deliberately registered
// BEFORE the generic /:id routes for this reason — caught and fixed
// during review, not something to silently re-break later by adding a
// new /:id-style route above these.

const express = require('express');
const router = express.Router();
const { body, param, query: queryValidator, validationResult } = require('express-validator');
const { authenticate, authorize, audit } = require('../middleware/auth');
const tournamentMatchService = require('../services/tournamentMatchService');
const tournamentNotificationService = require('../services/tournamentNotificationService');
const logger = require('../utils/logger');

const EVENT_MANAGERS = ['coach', 'academy_director', 'federation_admin', 'super_admin'];

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
}

// ─── Literal-path reads FIRST — see route-order note above ─────────────────────

router.get('/order-of-play',
  authenticate,
  queryValidator('eventId').isUUID(),
  queryValidator('date').optional().isISO8601(),
  handleValidation,
  async (req, res) => {
    try {
      const matches = await tournamentMatchService.getOrderOfPlay(req.query.eventId, req.query.date);
      res.json(matches);
    } catch (err) {
      logger.error('Get order of play failed', { error: err.message });
      res.status(500).json({ error: 'Failed to fetch order of play' });
    }
  }
);

router.get('/live',
  authenticate,
  queryValidator('eventId').isUUID(),
  handleValidation,
  async (req, res) => {
    try {
      const matches = await tournamentMatchService.getLiveMatches(req.query.eventId);
      res.json(matches);
    } catch (err) {
      logger.error('Get live matches failed', { error: err.message });
      res.status(500).json({ error: 'Failed to fetch live matches' });
    }
  }
);

router.get('/results',
  authenticate,
  queryValidator('eventId').isUUID(),
  queryValidator('round').optional().isInt(),
  handleValidation,
  async (req, res) => {
    try {
      const results = await tournamentMatchService.getResults(req.query.eventId, req.query.round);
      res.json(results);
    } catch (err) {
      logger.error('Get results failed', { error: err.message });
      res.status(500).json({ error: 'Failed to fetch results' });
    }
  }
);

router.get('/player/:playerId/history',
  authenticate,
  param('playerId').isUUID(),
  handleValidation,
  async (req, res) => {
    try {
      const history = await tournamentMatchService.getPlayerMatchHistory(req.params.playerId, req.query.limit);
      res.json(history);
    } catch (err) {
      logger.error('Get player match history failed', { error: err.message });
      res.status(500).json({ error: 'Failed to fetch player match history' });
    }
  }
);

// ─── Generic /:id reads ─────────────────────────────────────────────────────────

router.get('/:id/history', authenticate, param('id').isUUID(), handleValidation, async (req, res) => {
  try {
    const history = await tournamentMatchService.getMatchHistory(req.params.id);
    res.json(history);
  } catch (err) {
    logger.error('Get match history failed', { error: err.message, matchId: req.params.id });
    res.status(500).json({ error: 'Failed to fetch match history' });
  }
});

router.get('/:id', authenticate, param('id').isUUID(), handleValidation, async (req, res) => {
  try {
    const match = await tournamentMatchService.getMatch(req.params.id);
    res.json(match);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ─── Writes — the secure update flows requested in the brief ──────────────────

router.patch('/:id/schedule',
  authenticate, authorize(...EVENT_MANAGERS),
  param('id').isUUID(),
  handleValidation,
  audit('update_match_schedule', 'tournament_match'),
  async (req, res) => {
    try {
      const match = await tournamentMatchService.updateSchedule(req.params.id, req.body, req.user.id);
      try {
        await tournamentNotificationService.notifyScheduleChanged(match, req.body.reason);
      } catch (notifyErr) {
        logger.warn('Schedule-changed notification failed (non-fatal)', { error: notifyErr.message });
      }
      res.json(match);
    } catch (err) {
      logger.error('Update match schedule failed', { error: err.message, matchId: req.params.id });
      res.status(400).json({ error: err.message });
    }
  }
);

// Anything that ISN'T a final result — see tournamentMatchService for
// why completed/retired/walkover must go through /result instead.
router.post('/:id/status',
  authenticate, authorize(...EVENT_MANAGERS),
  param('id').isUUID(),
  body('status').isIn(['scheduled', 'upcoming', 'live', 'suspended', 'cancelled']),
  handleValidation,
  audit('set_match_status', 'tournament_match'),
  async (req, res) => {
    try {
      const match = await tournamentMatchService.setMatchStatus(req.params.id, req.body.status, req.user.id);

      if (req.body.status === 'live') {
        try {
          await tournamentNotificationService.notifyMatchStartingSoon(match);
        } catch (notifyErr) {
          logger.warn('Match-starting notification failed (non-fatal)', { error: notifyErr.message });
        }
      }

      res.json(match);
    } catch (err) {
      logger.error('Set match status failed', { error: err.message, matchId: req.params.id });
      res.status(400).json({ error: err.message });
    }
  }
);

// The core secure score-entry flow — gated to EVENT_MANAGERS only, every
// change traced via last_updated_by + tournament_match_history (see
// service layer). Triggers round advancement and a result notification.
router.post('/:id/result',
  authenticate, authorize(...EVENT_MANAGERS),
  param('id').isUUID(),
  body('status').optional().isIn(['completed', 'retired', 'walkover']),
  handleValidation,
  audit('record_match_result', 'tournament_match'),
  async (req, res) => {
    try {
      const { match, advancement } = await tournamentMatchService.recordResult(req.params.id, req.body, req.user.id);

      try {
        await tournamentNotificationService.notifyMatchResult(match);
      } catch (notifyErr) {
        logger.warn('Match-result notification failed (non-fatal)', { error: notifyErr.message });
      }

      res.json({ match, advancement });
    } catch (err) {
      logger.error('Record match result failed', { error: err.message, matchId: req.params.id });
      res.status(400).json({ error: err.message });
    }
  }
);

router.patch('/:id/featured',
  authenticate, authorize(...EVENT_MANAGERS),
  param('id').isUUID(),
  body('isFeatured').isBoolean(),
  handleValidation,
  audit('set_featured_match', 'tournament_match'),
  async (req, res) => {
    try {
      const match = await tournamentMatchService.setFeaturedMatch(req.params.id, req.body.isFeatured, req.user.id);
      res.json(match);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

router.patch('/:id/stream',
  authenticate, authorize(...EVENT_MANAGERS),
  param('id').isUUID(),
  handleValidation,
  audit('set_match_stream_links', 'tournament_match'),
  async (req, res) => {
    try {
      const match = await tournamentMatchService.setStreamLinks(req.params.id, req.body, req.user.id);
      res.json(match);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

module.exports = router;
