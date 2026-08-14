/**
 * Stripe Service — aligned to the live CG Tennis OS `users` schema
 * ---------------------------------------------------------------
 * Reads/writes only columns that already exist on `users`:
 *   stripe_customer_id, stripe_subscription_id,
 *   subscription_plan, subscription_status
 *
 * Deliberate design decisions:
 *  - Trial state lives in `trial_started_at` / `trial_expires_at` /
 *    `trial_extended` / `trial_nudge_sent_at` / `trial_status` and is
 *    owned entirely by `services/trialService.js`. Nothing in this file
 *    touches those columns. Stripe events move only the subscription_*
 *    columns, so the existing trial scheduler keeps working unchanged.
 *  - Only Starter and Professional are self-serve. Academy is
 *    contact-sales and is intentionally absent from the price map, as is
 *    the privately-invited Founding Cohort rate — both are set manually
 *    via PATCH /admin/access/users/:id.
 *  - On cancellation the plan reverts to 'starter' (there is no
 *    free-forever tier in the confirmed pricing model).
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const logger = require('../utils/logger');

// Self-serve plans only. Academy/Founding are handled by the admin access route.
const SELF_SERVE_PLANS = ['starter', 'professional'];

// Stripe subscription statuses mapped onto the values the app stores in
// users.subscription_status. Anything unrecognised is stored verbatim only
// if it is in this map, otherwise it is ignored to avoid writing junk.
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

  priceIdForPlan(planId) {
    const priceMap = {
      starter: process.env.STRIPE_PRICE_STARTER,
      professional: process.env.STRIPE_PRICE_PROFESSIONAL,
      // 'academy' intentionally omitted — contact-sales only.
    };
    return priceMap[planId];
  }

  /**
   * Create a Stripe Checkout Session for a self-serve plan.
   * Reuses the user's existing Stripe customer when one is already stored.
   */
  async createCheckoutSession(userId, planId, successUrl, cancelUrl) {
    if (!SELF_SERVE_PLANS.includes(planId)) {
      const err = new Error(`Plan is not available for self-serve checkout: ${planId}`);
      err.statusCode = 400;
      throw err;
    }

    const priceId = this.priceIdForPlan(planId);
    if (!priceId) {
      // Misconfiguration rather than bad input — surface it clearly in logs.
      const err = new Error(`Missing Stripe price ID for plan: ${planId}`);
      err.statusCode = 500;
      throw err;
    }

    try {
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
        metadata: { userId: String(userId), planId },
        subscription_data: {
          metadata: { userId: String(userId), planId },
        },
      });

      logger.info('Stripe checkout session created', { userId, planId, sessionId: session.id });
      return session;
    } catch (error) {
      logger.error('Error creating Stripe checkout session', {
        error: error.message,
        userId,
        planId,
      });
      throw error;
    }
  }

  /**
   * Route a verified Stripe webhook event to the right handler.
   */
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

  /**
   * checkout.session.completed — the subscription has been paid for.
   * Resolves the user by metadata.userId, falling back to
   * client_reference_id, then to the Stripe customer ID.
   */
  async handleCheckoutCompleted(session) {
    const userId = session.metadata?.userId || session.client_reference_id || null;
    const planId = session.metadata?.planId || null;
    const stripeSubscriptionId = session.subscription || null;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

    if (!planId || !SELF_SERVE_PLANS.includes(planId)) {
      logger.warn('checkout.session.completed with unusable planId — status only', {
        sessionId: session.id,
        planId,
      });
    }

    // Only write subscription_plan when we actually recognise the plan, so a
    // malformed event can never blank out or corrupt a user's tier.
    const planToWrite = SELF_SERVE_PLANS.includes(planId) ? planId : null;

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
        [planToWrite, stripeSubscriptionId, customerId || null, userId]
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
        [planToWrite, stripeSubscriptionId, customerId]
      );
    } else {
      logger.error('checkout.session.completed with no userId and no customer — cannot apply', {
        sessionId: session.id,
      });
      return;
    }

    if (!result.rows.length) {
      logger.error('checkout.session.completed matched no user row', {
        sessionId: session.id,
        userId,
        customerId,
      });
      return;
    }

    logger.info('Subscription activated', {
      userId: result.rows[0].id,
      planId: planToWrite,
      stripeSubscriptionId,
    });
  }

  /**
   * customer.subscription.updated — reflect Stripe's status onto the user.
   */
  async handleSubscriptionUpdated(subscription) {
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;
    const mappedStatus = SUBSCRIPTION_STATUS_MAP[subscription.status];

    if (!customerId) {
      logger.warn('customer.subscription.updated without a customer ID', {
        subscriptionId: subscription.id,
      });
      return;
    }

    if (!mappedStatus) {
      logger.info('Ignoring unmapped Stripe subscription status', {
        customerId,
        status: subscription.status,
      });
      return;
    }

    const result = await this.db.query(
      `UPDATE users
          SET subscription_status = $1,
              stripe_subscription_id = COALESCE(stripe_subscription_id, $2),
              updated_at = NOW()
        WHERE stripe_customer_id = $3
      RETURNING id`,
      [mappedStatus, subscription.id || null, customerId]
    );

    if (!result.rows.length) {
      logger.warn('customer.subscription.updated matched no user row', { customerId });
      return;
    }

    logger.info('Subscription status updated', {
      userId: result.rows[0].id,
      status: mappedStatus,
    });
  }

  /**
   * customer.subscription.deleted — revert to the entry tier, keeping the
   * Stripe customer ID so a future re-subscribe reuses the same customer.
   */
  async handleSubscriptionDeleted(subscription) {
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

    if (!customerId) {
      logger.warn('customer.subscription.deleted without a customer ID', {
        subscriptionId: subscription.id,
      });
      return;
    }

    const result = await this.db.query(
      `UPDATE users
          SET subscription_status = 'canceled',
              subscription_plan = 'starter',
              stripe_subscription_id = NULL,
              updated_at = NOW()
        WHERE stripe_customer_id = $1
      RETURNING id`,
      [customerId]
    );

    if (!result.rows.length) {
      logger.warn('customer.subscription.deleted matched no user row', { customerId });
      return;
    }

    logger.info('Subscription canceled', { userId: result.rows[0].id });
  }
}

module.exports = StripeService;
