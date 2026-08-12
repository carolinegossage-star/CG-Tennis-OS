const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const emailService = require('../services/emailService');
const trialService = require('../services/trialService');
const { isDisposableEmail } = require('../utils/disposableEmailDomains');
const logger = require('../utils/logger');

const generateTokens = (userId, role) => {
  const accessToken = jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
  return { accessToken, refreshToken };
};

// POST /auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  body('name').trim().notEmpty().isLength({ max: 255 }),
  body('role').optional().isIn(['coach', 'academy_director', 'parent', 'player']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password, name, role = 'coach', phone, timezone = 'Europe/London' } = req.body;

  if (isDisposableEmail(email)) {
    return res.status(400).json({
      error: 'Please use a permanent email address to register.',
      code: 'DISPOSABLE_EMAIL',
    });
  }

  try {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Email already registered', code: 'EMAIL_EXISTS' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verifyToken = uuidv4();

    const result = await query(
      `INSERT INTO users (email, password_hash, name, role, phone, timezone, email_verify_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, name, role, created_at`,
      [email, passwordHash, name, role, phone || null, timezone, verifyToken]
    );

    const user = result.rows[0];

    // Create coach profile automatically for coaches
    if (role === 'coach' || role === 'academy_director') {
      await query(
        'INSERT INTO coach_profiles (user_id) VALUES ($1)',
        [user.id]
      );
      // Start the 14-day trial clock (extension logic runs daily — see server.js)
      await trialService.startTrial(user.id);
    }

    // Send verification email (non-blocking)
    emailService.sendVerificationEmail(email, name, verifyToken).catch(e =>
      logger.warn('Verification email failed', { error: e.message })
    );

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
    await query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);

    logger.info('New user registered', { userId: user.id, role });
    res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) {
    logger.error('Registration error', { error: err.message });
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;

  try {
    const result = await query(
      'SELECT id, email, password_hash, name, role, is_active, avatar_url, language_pref, timezone FROM users WHERE email = $1',
      [email]
    );

    const user = result.rows[0];
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account deactivated', code: 'DEACTIVATED' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
    await query(
      'UPDATE users SET refresh_token = $1, last_login_at = NOW() WHERE id = $2',
      [refreshToken, user.id]
    );

    const { password_hash, ...safeUser } = user;
    logger.info('User logged in', { userId: user.id });
    res.json({ user: safeUser, accessToken, refreshToken });
  } catch (err) {
    logger.error('Login error', { error: err.message });
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /auth/refresh-token
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const result = await query(
      'SELECT id, role, refresh_token, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    const user = result.rows[0];
    if (!user || user.refresh_token !== refreshToken || !user.is_active) {
      return res.status(401).json({ error: 'Invalid refresh token', code: 'INVALID_REFRESH' });
    }

    const tokens = generateTokens(user.id, user.role);
    await query('UPDATE users SET refresh_token = $1 WHERE id = $2', [tokens.refreshToken, user.id]);
    res.json(tokens);
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /auth/logout
router.post('/logout', authenticate, async (req, res) => {
  await query('UPDATE users SET refresh_token = NULL WHERE id = $1', [req.user.id]);
  logger.info('User logged out', { userId: req.user.id });
  res.json({ message: 'Logged out successfully' });
});

// POST /auth/forgot-password
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail(),
], async (req, res) => {
  const { email } = req.body;
  try {
    const result = await query('SELECT id, name FROM users WHERE email = $1', [email]);
    // Always return 200 to prevent email enumeration
    if (result.rows.length) {
      const token = uuidv4();
      const expires = new Date(Date.now() + 3600000); // 1 hour
      await query(
        'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
        [token, expires, email]
      );
      emailService.sendPasswordResetEmail(email, result.rows[0].name, token).catch(e =>
        logger.warn('Password reset email failed', { error: e.message })
      );
    }
    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    logger.error('Forgot password error', { error: err.message });
    res.status(500).json({ error: 'Request failed' });
  }
});

// POST /auth/reset-password
router.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { token, password } = req.body;
  try {
    const result = await query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );
    if (!result.rows.length) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const hash = await bcrypt.hash(password, 12);
    await query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, refresh_token = NULL WHERE id = $2',
      [hash, result.rows[0].id]
    );
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    logger.error('Reset password error', { error: err.message });
    res.status(500).json({ error: 'Reset failed' });
  }
});

// POST /auth/change-password
router.post('/change-password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { currentPassword, newPassword } = req.body;
  try {
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!await bcrypt.compare(currentPassword, result.rows[0].password_hash)) {
      return res.status(401).json({ error: 'Current password incorrect' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await query(
      'UPDATE users SET password_hash = $1, refresh_token = NULL WHERE id = $2',
      [hash, req.user.id]
    );
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    logger.error('Change password error', { error: err.message });
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// GET /auth/trial-status
router.get('/trial-status', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT trial_started_at, trial_expires_at, trial_extended, trial_status FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

    const trial = result.rows[0];
    const progress = await trialService.getMilestoneProgress(req.user.id);

    res.json({ ...trial, progress });
  } catch (err) {
    logger.error('Trial status error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch trial status' });
  }
});

module.exports = router;
