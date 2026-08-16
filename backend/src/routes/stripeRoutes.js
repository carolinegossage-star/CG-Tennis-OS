/**
 * Stripe Checkout Routes
 * Mounted at /stripe.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const StripeService = require('../services/stripeService');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const stripeService = new StripeService({ query });
const SELF_SERVE_PLAN_IDS = ['solo_monthly', 'solo_annual', 'professional_monthly', 'professional_annual'];

// POST /stripe/create-checkout-session
// Body: { planId: 'solo_monthly' | 'solo_annual' | 'professional_monthly' | 'professional_annual' }
router.post('/create-checkout-session', authenticate, async (req, res) => {
  const { planId } = req.body || {};
  const userId = req.user.id;

  if (!SELF_SERVE_PLAN_IDS.includes(planId)) {
    return res.status(400).json({
      error: `planId must be one of: ${SELF_SERVE_PLAN_IDS.join(', ')}. Academy is contact-sales only.`,
    });
  }

  try {
    const successUrl = `${process.env.FRONTEND_URL}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.FRONTEND_URL}/pricing?checkout=cancelled`;
    const session = await stripeService.createCheckoutSession(userId, planId, successUrl, cancelUrl);
    res.json({ url: session.url });
  } catch (error) {
    logger.error('Failed to create checkout session', { error: error.message, userId, planId });
    const status = error.statusCode === 400 || error.statusCode === 404 ? error.statusCode : 500;
    res.status(status).json({ error: status === 500 ? 'Failed to create checkout session' : error.message });
  }
});

module.exports = router;
