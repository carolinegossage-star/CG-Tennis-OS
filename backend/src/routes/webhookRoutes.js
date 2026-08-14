/**
 * Stripe Webhook Route
 * ---------------------------------------------------------------
 * Mounted in server.js ABOVE the global express.json() middleware:
 *
 *   app.use('/webhooks', require('./routes/webhookRoutes'));
 *
 * This ordering is REQUIRED, not a preference. server.js applies
 * express.json({ limit: '10mb' }) globally, and once that has parsed the
 * request, req.body is a plain object rather than the raw Buffer that
 * stripe.webhooks.constructEvent() needs to verify the signature.
 * Mounting this router earlier means express.raw() below is the first
 * body parser to see the request, so the signature check works.
 *
 * Live endpoint: POST https://api.cgtennisos.com/webhooks/stripe
 */

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const StripeService = require('../services/stripeService');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const stripeService = new StripeService({ query });

/**
 * POST /webhooks/stripe
 */
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    logger.error('Stripe webhook received but STRIPE_WEBHOOK_SECRET is not configured');
    return res.status(500).send('Webhook not configured');
  }

  if (!Buffer.isBuffer(req.body)) {
    // Guards against a future refactor moving this mount below express.json().
    logger.error('Stripe webhook body is not raw — check that /webhooks is mounted before express.json()');
    return res.status(500).send('Webhook body parsing misconfigured');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await stripeService.handleWebhook(event);
    res.json({ received: true });
  } catch (error) {
    // Returning 500 makes Stripe retry with backoff, which is what we want
    // for a transient database failure.
    logger.error('Error handling Stripe webhook', {
      error: error.message,
      eventType: event.type,
      eventId: event.id,
    });
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
