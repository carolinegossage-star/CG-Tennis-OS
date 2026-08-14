/**
 * Stripe Checkout Routes
 * ---------------------------------------------------------------
 * Mounted in server.js at root level, matching every other route on
 * this service (/auth, /players, /sessions, /voice-capture, ...):
 *
 *   app.use('/stripe', require('./routes/stripeRoutes'));
 *
 * Live endpoint: POST https://api.cgtennisos.com/stripe/create-checkout-session
 *
 * `authenticate` (middleware/auth.js) loads the full user row into
 * req.user, so req.user.id is the authenticated coach's UUID.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const StripeService = require('../services/stripeService');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const stripeService = new StripeService({ query });

// Self-serve plans only. Academy is contact-sales; the Founding Cohort rate is
// privately invited and applied via PATCH /admin/access/users/:id.
const SELF_SERVE_PLANS = ['starter', 'professional'];

/**
 * POST /stripe/create-checkout-session
 * Body: { planId: 'starter' | 'professional' }
 * Returns: { url } — the Stripe-hosted Checkout URL to redirect to.
 */
router.post('/create-checkout-session', authenticate, async (req, res) => {
  const { planId } = req.body || {};
  const userId = req.user.id;

  if (!planId || !SELF_SERVE_PLANS.includes(planId)) {
    return res.status(400).json({
      error: `planId must be one of: ${SELF_SERVE_PLANS.join(', ')}. Academy is contact-sales only.`,
    });
  }

  try {
    const successUrl = `${process.env.FRONTEND_URL}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.FRONTEND_URL}/pricing?checkout=cancelled`;

    const session = await stripeService.createCheckoutSession(userId, planId, successUrl, cancelUrl);
    res.json({ url: session.url });
  } catch (error) {
    logger.error('Failed to create checkout session', {
      error: error.message,
      userId,
      planId,
    });
    const status = error.statusCode === 400 || error.statusCode === 404 ? error.statusCode : 500;
    res.status(status).json({
      error: status === 500 ? 'Failed to create checkout session' : error.message,
    });
  }
});

module.exports = router;
