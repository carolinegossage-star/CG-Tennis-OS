/**
 * Stripe Service — aligned to the live CG Tennis OS `users` schema.
 *
 * Self-serve plan IDs include billing period (`solo_monthly`, etc.), while
 * users.subscription_plan stores only the base plan (`solo` or `professional`).
 * Academy remains contact-sales only.
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const logger = require('../utils/logger');

const PLAN_CONFIG = {
  solo_monthly: { basePlan: 'solo', priceEnv: 'STRIPE_PRICE_SOLO_MONTHLY' },
  solo_annual: { basePlan: 'solo', priceEnv: 'STRIPE_PRICE_SOLO_ANNUAL' },
  professional_monthly: { basePlan: 'professional', priceEnv: 'STRIPE_PRICE_PROFESSIONAL_MONTHLY' },
  professional_annual: { basePlan: 'professional', priceEnv: 'STRIPE_PRICE_PROFESSIONAL_ANNUAL' },
};

const SELF_SERVE_PLAN_IDS = Object.keys(PLAN_CONFIG);
const SELF_SERVE_BASE_PLANS = ['solo', 'professional'];

const SUBSCRIPTION_STATUS_MAP = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  unpaid: 'past_due',
  canceled: 'canceled',
  incomplete: 'past_due',
  incomplete_expired: 'canceled',
  paused: 'restricted',
};

class StripeService {
  constructor(db) {
    this.db = db;
  }

  planConfig(planId) {
    return PLAN_CONFIG[planId];
  }

  priceIdForPlan(planId) {
    const config = this.planConfig(planId);
    return config ? process.env[config.priceEnv] : undefined;
  }

  basePlanForPlanId(planId) {
    return this.planConfig(planId)?.basePlan;
  }

  async createCheckoutSession(userId, planId, successUrl, cancelUrl) {
    const config = this.planConfig(planId);
    if (!config) {
      const err = new Error(`Plan is not available for self-serve checkout: ${planId}`);
      err.statusCode = 400;
      throw err;
    }

    const priceId = this.priceIdForPlan(planId);
    if (!priceId) {
      const err = new Error(`Missing Stripe price ID for plan: ${planId}`);
      err.statusCode = 500;
      throw err;
    }

    const userResult = await this.db.query(
      'SELECT id, email, stripe_customer_id FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: String(userId) },
      });
      customerId = customer.id;
      await this.db.query(
        'UPDATE users SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2',
        [customerId, userId]
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: String(userId),
      metadata: { userId: String(userId), planId, basePlan: config.basePlan },
      subscription_data: {
        metadata: { userId: String(userId), planId, basePlan: config.basePlan },
      },
    });

    logger.info('Stripe checkout session created', { userId, planId, sessionId: session.id });
    return session;
  }

  async handleWebhook(event) {
    const obj = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(obj);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(obj);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(obj);
        break;
      default:
        logger.info(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  async handleCheckoutCompleted(session) {
    const userId = session.metadata?.userId || session.client_reference_id || null;
    const planId = session.metadata?.planId || null;
    const basePlan = this.basePlanForPlanId(planId);
    const stripeSubscriptionId = session.subscription || null;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

    if (!basePlan) {
      logger.warn('checkout.session.completed with unusable planId', { sessionId: session.id, planId });
    }

    const values = [basePlan || null, stripeSubscriptionId, customerId || null];
    let result;
    if (userId) {
      result = await this.db.query(
        `UPDATE users
            SET subscription_status = 'active',
                subscription_plan = COALESCE($1, subscription_plan),
                stripe_subscription_id = COALESCE($2, stripe_subscription_id),
                stripe_customer_id = COALESCE(stripe_customer_id, $3),
                updated_at = NOW()
          WHERE id = $4
        RETURNING id`,
        [...values, userId]
      );
    } else if (customerId) {
      result = await this.db.query(
        `UPDATE users
            SET subscription_status = 'active',
                subscription_plan = COALESCE($1, subscription_plan),
                stripe_subscription_id = COALESCE($2, stripe_subscription_id),
                updated_at = NOW()
          WHERE stripe_customer_id = $3
        RETURNING id`,
        [basePlan || null, stripeSubscriptionId, customerId]
      );
    } else {
      logger.error('checkout.session.completed missing user and customer', { sessionId: session.id });
      return;
    }

    if (!result.rows.length) logger.warn('checkout.session.completed matched no user row', { sessionId: session.id, userId, customerId });
  }

  async handleSubscriptionUpdated(subscription) {
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    const mappedStatus = SUBSCRIPTION_STATUS_MAP[subscription.status];
    if (!customerId || !mappedStatus) return;

    const result = await this.db.query(
      `UPDATE users
          SET subscription_status = $1,
              stripe_subscription_id = COALESCE(stripe_subscription_id, $2),
              updated_at = NOW()
        WHERE stripe_customer_id = $3
      RETURNING id`,
      [mappedStatus, subscription.id || null, customerId]
    );
    if (!result.rows.length) logger.warn('customer.subscription.updated matched no user row', { customerId });
  }

  async handleSubscriptionDeleted(subscription) {
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    if (!customerId) return;

    const result = await this.db.query(
      `UPDATE users
          SET subscription_status = 'canceled',
              subscription_plan = 'solo',
              stripe_subscription_id = NULL,
              updated_at = NOW()
        WHERE stripe_customer_id = $1
      RETURNING id`,
      [customerId]
    );
    if (!result.rows.length) logger.warn('customer.subscription.deleted matched no user row', { customerId });
  }
}

module.exports = StripeService;
module.exports.PLAN_CONFIG = PLAN_CONFIG;
module.exports.SELF_SERVE_PLAN_IDS = SELF_SERVE_PLAN_IDS;
module.exports.SELF_SERVE_BASE_PLANS = SELF_SERVE_BASE_PLANS;
