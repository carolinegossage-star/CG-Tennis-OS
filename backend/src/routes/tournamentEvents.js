// ============================================================
// CG Tennis OS™ — TOURNAMENT EVENTS ROUTES
// Event admin (create/update/publish/pause/archive), registration
// rules, eligibility, and check-in.
// © CG Tennis Academies. All Rights Reserved.
// ============================================================
//
// Mounted at /tournament-events — deliberately separate from the
// existing /tournaments route (discovery + entry tracking), which stays
// untouched. See migrate_tournament_engine.sql for the full
// architecture reasoning.

const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { authenticate, authorize, audit } = require('../middleware/auth');
const tournamentEventService = require('../services/tournamentEventService');
const logger = require('../utils/logger');

// Roles permitted to create/edit/publish events. Players and parents
// can read (see GET routes below, authenticate-only); only coaching
// staff and admins can write.
const EVENT_MANAGERS = ['coach', 'academy_director', 'federation_admin', 'super_admin'];

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
}

// ─── Reads (any authenticated user) ────────────────────────────────────────────

router.get('/', authenticate, async (req, res) => {
  try {
    const { status, tournamentId, visibility } = req.query;
    const events = await tournamentEventService.listEvents({ status, tournamentId, visibility });
    res.json(events);
  } catch (err) {
    logger.error('List tournament events failed', { error: err.message });
    res.status(500).json({ error: 'Failed to list tournament events' });
  }
});

router.get('/:id', authenticate, param('id').isUUID(), handleValidation, async (req, res) => {
  try {
    const event = await tournamentEventService.getEvent(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) {
    logger.error('Get tournament event failed', { error: err.message, eventId: req.params.id });
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// The single-call aggregate the Live Event Dashboard page polls every
// 30 seconds — event summary + "my players in this event" + their next
// matches + prep/reflection context, in one response. See
// tournamentEventService.getEventDashboard for the full reasoning.
router.get('/:id/dashboard', authenticate, param('id').isUUID(), handleValidation, async (req, res) => {
  try {
    const dashboard = await tournamentEventService.getEventDashboard(req.params.id, req.user.id);
    res.json(dashboard);
  } catch (err) {
    logger.error('Get event dashboard failed', { error: err.message, eventId: req.params.id });
    res.status(err.message === 'Event not found' ? 404 : 500).json({ error: err.message });
  }
});

// ─── Admin: create / update / status ───────────────────────────────────────────

router.post('/',
  authenticate, authorize(...EVENT_MANAGERS),
  body('tournamentId').isUUID(),
  body('title').isString().trim().notEmpty(),
  handleValidation,
  audit('create_tournament_event', 'tournament_event'),
  async (req, res) => {
    try {
      const event = await tournamentEventService.createEvent(req.user.id, req.body);
      res.status(201).json(event);
    } catch (err) {
      logger.error('Create tournament event failed', { error: err.message, coachId: req.user.id });
      res.status(400).json({ error: err.message });
    }
  }
);

router.patch('/:id',
  authenticate, authorize(...EVENT_MANAGERS),
  param('id').isUUID(),
  handleValidation,
  audit('update_tournament_event', 'tournament_event'),
  async (req, res) => {
    try {
      const event = await tournamentEventService.updateEvent(req.params.id, req.body);
      res.json(event);
    } catch (err) {
      logger.error('Update tournament event failed', { error: err.message, eventId: req.params.id });
      res.status(400).json({ error: err.message });
    }
  }
);

// Status transitions are a distinct admin action, separate from the
// general PATCH above — worth its own audit entry and validation.
router.post('/:id/status',
  authenticate, authorize(...EVENT_MANAGERS),
  param('id').isUUID(),
  body('status').isIn(['draft', 'published', 'in_progress', 'paused', 'completed', 'archived']),
  handleValidation,
  audit('change_tournament_event_status', 'tournament_event'),
  async (req, res) => {
    try {
      const event = await tournamentEventService.setEventStatus(req.params.id, req.body.status, req.user.id);
      res.json(event);
    } catch (err) {
      logger.error('Set event status failed', { error: err.message, eventId: req.params.id });
      res.status(400).json({ error: err.message });
    }
  }
);

// ─── Registration rules ────────────────────────────────────────────────────────

router.put('/:id/registration-rules',
  authenticate, authorize(...EVENT_MANAGERS),
  param('id').isUUID(),
  handleValidation,
  audit('set_registration_rules', 'tournament_event'),
  async (req, res) => {
    try {
      const rules = await tournamentEventService.setRegistrationRules(req.params.id, req.body);
      res.json(rules);
    } catch (err) {
      logger.error('Set registration rules failed', { error: err.message, eventId: req.params.id });
      res.status(400).json({ error: err.message });
    }
  }
);

router.get('/:id/eligibility/:playerId',
  authenticate,
  param('id').isUUID(), param('playerId').isUUID(),
  handleValidation,
  async (req, res) => {
    try {
      const result = await tournamentEventService.checkEligibility(req.params.id, req.params.playerId);
      res.json(result);
    } catch (err) {
      logger.error('Eligibility check failed', { error: err.message, eventId: req.params.id });
      res.status(400).json({ error: err.message });
    }
  }
);

// ─── Check-in ───────────────────────────────────────────────────────────────────

router.post('/:id/checkin/:entryId',
  authenticate, authorize(...EVENT_MANAGERS),
  param('id').isUUID(), param('entryId').isUUID(),
  handleValidation,
  audit('checkin_entry', 'tournament_event'),
  async (req, res) => {
    try {
      const checkin = await tournamentEventService.checkInEntry(req.params.id, req.params.entryId, req.user.id);
      res.json(checkin);
    } catch (err) {
      logger.error('Check-in failed', { error: err.message, eventId: req.params.id, entryId: req.params.entryId });
      res.status(400).json({ error: err.message });
    }
  }
);

module.exports = router;
