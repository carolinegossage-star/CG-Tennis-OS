// ============================================================
// CG Tennis OS™ — TOURNAMENT DRAWS ROUTES
// Draw/bracket creation and generation.
// © CG Tennis Academies. All Rights Reserved.
// ============================================================
//
// Mounted at /tournament-draws.

const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { authenticate, authorize, audit } = require('../middleware/auth');
const tournamentDrawService = require('../services/tournamentDrawService');
const tournamentNotificationService = require('../services/tournamentNotificationService');
const tournamentEventService = require('../services/tournamentEventService');
const logger = require('../utils/logger');

const EVENT_MANAGERS = ['coach', 'academy_director', 'federation_admin', 'super_admin'];

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
}

router.get('/:id', authenticate, param('id').isUUID(), handleValidation, async (req, res) => {
  try {
    const draw = await tournamentDrawService.getDrawWithPositions(req.params.id);
    res.json(draw);
  } catch (err) {
    logger.error('Get draw failed', { error: err.message, drawId: req.params.id });
    res.status(404).json({ error: err.message });
  }
});

router.post('/',
  authenticate, authorize(...EVENT_MANAGERS),
  body('eventId').isUUID(),
  handleValidation,
  audit('create_tournament_draw', 'tournament_draw'),
  async (req, res) => {
    try {
      const { eventId, ...config } = req.body;
      const draw = await tournamentDrawService.createDraw(eventId, config, req.user.id);
      res.status(201).json(draw);
    } catch (err) {
      logger.error('Create draw failed', { error: err.message });
      res.status(400).json({ error: err.message });
    }
  }
);

// The actual bracket-build step — separate from createDraw, since a
// coach may want to configure draw settings first and populate the
// real entrant list moments later, once check-ins are confirmed.
router.post('/:id/generate',
  authenticate, authorize(...EVENT_MANAGERS),
  param('id').isUUID(),
  body('entryIds').isArray({ min: 2 }),
  handleValidation,
  audit('generate_tournament_bracket', 'tournament_draw'),
  async (req, res) => {
    try {
      const { entryIds, seedAssignments = {} } = req.body;
      const draw = await tournamentDrawService.generateBracket(req.params.id, entryIds, seedAssignments);

      // Notify entered players' coaches the draw is live — best-effort,
      // never lets a notification failure undo a successfully generated
      // bracket (the draw is already committed by this point).
      try {
        const event = await tournamentEventService.getEvent(draw.event_id);
        const playerIds = draw.positions.map((p) => p.player_id);
        await tournamentNotificationService.notifyDrawPublished(event, playerIds);
      } catch (notifyErr) {
        logger.warn('Draw-published notification failed (non-fatal)', { error: notifyErr.message });
      }

      res.json(draw);
    } catch (err) {
      logger.error('Generate bracket failed', { error: err.message, drawId: req.params.id });
      res.status(400).json({ error: err.message });
    }
  }
);

module.exports = router;
