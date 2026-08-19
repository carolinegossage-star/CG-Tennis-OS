const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const logger = require('../utils/logger');
const { getAccessContext } = require('../services/accessContext');

// ─── Authenticate JWT ──────────────────────────────────────────────────────────
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify user still exists and is active
    const result = await query(
      `SELECT id, email, role, name, language_pref, timezone, is_active,
              is_admin, is_comped, comped_plan, subscription_plan,
              subscription_status, trial_status, trial_expires_at
         FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (!result.rows.length || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'User not found or deactivated', code: 'INVALID_USER' });
    }

    req.user = result.rows[0];
    req.user.access = getAccessContext(req.user);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }
    logger.error('Auth middleware error', { error: err.message });
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// ─── Role-Based Access Control ────────────────────────────────────────────────
const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!allowedRoles.includes(req.user.role)) {
    logger.warn('Unauthorised access attempt', {
      userId: req.user.id,
      role: req.user.role,
      required: allowedRoles,
      path: req.path,
    });
    return res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
  }
  next();
};

// ─── Coach Ownership Guard ─────────────────────────────────────────────────────
// Ensures a coach can only access their own players/sessions unless admin
const ownCoachOnly = (paramField = 'coach_id') => (req, res, next) => {
  const { role, id } = req.user;
  if (role === 'super_admin' || role === 'federation_admin') return next();
  if (role === 'academy_director') return next(); // Can see all coaches in academy
  const requestedId = req.params[paramField] || req.query[paramField];
  if (requestedId && requestedId !== id) {
    return res.status(403).json({ error: 'Access denied', code: 'NOT_YOUR_RESOURCE' });
  }
  next();
};

// ─── Audit Logger ─────────────────────────────────────────────────────────────
const audit = (action, resourceType) => async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = async (body) => {
    try {
      await query(
        `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, inputs, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          req.user?.id || null,
          action,
          resourceType,
          body?.id || req.params?.id || null,
          JSON.stringify({ body: req.body, params: req.params, query: req.query }),
          req.ip,
          req.headers['user-agent'],
        ]
      );
    } catch (e) {
      logger.warn('Audit log failed (non-fatal)', { error: e.message });
    }
    return originalJson(body);
  };
  next();
};

module.exports = { authenticate, authorize, ownCoachOnly, audit };
