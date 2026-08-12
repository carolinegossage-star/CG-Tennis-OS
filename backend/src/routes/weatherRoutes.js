// ============================================================
// CG Tennis OS™ — WEATHER ROUTES
// Powers the Business Dashboard's Weather Alert slot.
// © CG Tennis Academies. All Rights Reserved.
// ============================================================

const express = require('express');
const router = express.Router();
const { query: queryValidator, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const weatherService = require('../services/weatherService');
const logger = require('../utils/logger');

// GET /weather/forecast?lat=&lng=&label=
// Raw forecast — used by any feature that needs more than a yes/no risk
// flag (e.g. a future hourly forecast widget).
router.get('/forecast', authenticate, [
  queryValidator('lat').isFloat({ min: -90, max: 90 }),
  queryValidator('lng').isFloat({ min: -180, max: 180 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const label = req.query.label || '';

  try {
    const forecast = await weatherService.getForecast(lat, lng, label);
    res.json(forecast);
  } catch (err) {
    logger.error('Weather forecast request failed', { error: err.message, lat, lng });
    res.status(503).json({ error: 'Weather forecast temporarily unavailable' });
  }
});

// GET /weather/session-risk?lat=&lng=&label=
// The endpoint the Business Dashboard's Weather Alert slot actually calls —
// answers "is there a disruption risk today" directly, so the frontend
// doesn't need to interpret raw forecast data itself.
router.get('/session-risk', authenticate, [
  queryValidator('lat').isFloat({ min: -90, max: 90 }),
  queryValidator('lng').isFloat({ min: -180, max: 180 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const label = req.query.label || '';

  try {
    const risk = await weatherService.checkSessionWeatherRisk(lat, lng, label);
    res.json(risk);
  } catch (err) {
    logger.error('Weather session-risk request failed', { error: err.message, lat, lng });
    // Fail soft — a coach not seeing a weather warning is far better than a
    // broken dashboard. The Weather Alert slot simply stays hidden on error.
    res.json({ atRisk: false, error: 'unavailable' });
  }
});

module.exports = router;
