/**
 * Trial Activation Service
 *
 * Every coach gets a 14-day free trial. Coaches who genuinely use the system
 * in that window earn an extra 7 days before they're asked to pick a paid plan.
 *
 * Qualifying activity (all three required):
 *   1. Added at least 1 player profile
 *   2. Planned at least 2 sessions
 *   3. Completed at least 1 session reflection/review
 *
 * Timeline:
 *   Day 10  → if not yet qualified, send a nudge encouraging the coach to
 *             finish the milestones and unlock the extension
 *   Day 14  → if qualified, automatically extend trial_expires_at by 7 days
 *             and mark trial_status = 'extended'
 *           → if not qualified, trial_status = 'expired' and the coach is
 *             shown the paywall/upgrade screen on next login
 *
 * This runs daily via a scheduled job (see server.js) and is safe to run
 * more than once a day — every check is idempotent (guarded by trial_status
 * and trial_nudge_sent_at).
 */

const pool = require('../config/database');
const emailService = require('./emailService');
const logger = require('../utils/logger');

const MIN_SESSIONS = 2;

async function getMilestoneProgress(userId) {
  const [playersResult, sessionsResult, reflectionsResult] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM players WHERE coach_id = $1', [userId]),
    pool.query('SELECT COUNT(*)::int AS count FROM sessions WHERE coach_id = $1', [userId]),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM sessions
       WHERE coach_id = $1
         AND (
           (reflection_text IS NOT NULL AND reflection_text <> '')
           OR reflection_voice_url IS NOT NULL
           OR (reflection_checklist IS NOT NULL AND reflection_checklist::text <> '{}')
         )`,
      [userId]
    ),
  ]);

  const playerAdded = playersResult.rows[0].count >= 1;
  const sessionsPlanned = sessionsResult.rows[0].count >= MIN_SESSIONS;
  const reflectionDone = reflectionsResult.rows[0].count >= 1;

  return {
    playerAdded,
    sessionsPlanned,
    sessionCount: sessionsResult.rows[0].count,
    reflectionDone,
    qualified: playerAdded && sessionsPlanned && reflectionDone,
  };
}

async function logEvent(userId, eventType, detail = {}) {
  await pool.query(
    'INSERT INTO trial_events (user_id, event_type, detail) VALUES ($1, $2, $3)',
    [userId, eventType, JSON.stringify(detail)]
  );
}

/**
 * Day-10 nudge: coaches who haven't yet qualified get an AI-voiced (Coach
 * Caroline G) email pointing at whichever milestone they're missing.
 */
async function sendNudgeIfDue() {
  const { rows: candidates } = await pool.query(
    `SELECT id, email, name, trial_started_at
     FROM users
     WHERE role = 'coach'
       AND trial_status = 'active'
       AND trial_nudge_sent_at IS NULL
       AND trial_started_at <= NOW() - INTERVAL '10 days'
       AND trial_started_at >  NOW() - INTERVAL '14 days'`
  );

  for (const coach of candidates) {
    const progress = await getMilestoneProgress(coach.id);
    if (progress.qualified) continue; // will be picked up by the day-14 extension check instead

    const missing = [];
    if (!progress.playerAdded) missing.push('add a player profile');
    if (!progress.sessionsPlanned) missing.push(`plan ${MIN_SESSIONS} sessions`);
    if (!progress.reflectionDone) missing.push('complete a session reflection');

    try {
      await emailService.sendTrialNudgeEmail(coach.email, coach.name, missing);
      await pool.query('UPDATE users SET trial_nudge_sent_at = NOW() WHERE id = $1', [coach.id]);
      await logEvent(coach.id, 'nudge_sent', { missing });
      logger.info('Trial nudge sent', { userId: coach.id, missing });
    } catch (err) {
      logger.error('Trial nudge failed to send', { userId: coach.id, error: err.message });
    }
  }

  return candidates.length;
}

/**
 * Day-14 resolution: qualified coaches get 7 extra days automatically;
 * everyone else is marked expired and sees the upgrade prompt.
 */
async function resolveExpiringTrials() {
  const { rows: expiring } = await pool.query(
    `SELECT id, email, name
     FROM users
     WHERE role = 'coach'
       AND trial_status = 'active'
       AND trial_expires_at <= NOW()`
  );

  let extended = 0;
  let expired = 0;

  for (const coach of expiring) {
    const progress = await getMilestoneProgress(coach.id);

    if (progress.qualified) {
      await pool.query(
        `UPDATE users
         SET trial_expires_at = trial_expires_at + INTERVAL '7 days',
             trial_extended = true,
             trial_status = 'extended'
         WHERE id = $1`,
        [coach.id]
      );
      await logEvent(coach.id, 'extended', { reason: 'milestones_met' });
      try {
        await emailService.sendTrialExtendedEmail(coach.email, coach.name);
      } catch (err) {
        logger.error('Trial extension email failed', { userId: coach.id, error: err.message });
      }
      extended += 1;
    } else {
      await pool.query(`UPDATE users SET trial_status = 'expired' WHERE id = $1`, [coach.id]);
      await logEvent(coach.id, 'expired', { progress });
      try {
        await emailService.sendTrialExpiredEmail(coach.email, coach.name);
      } catch (err) {
        logger.error('Trial expired email failed', { userId: coach.id, error: err.message });
      }
      expired += 1;
    }
  }

  return { extended, expired, checked: expiring.length };
}

/**
 * Runs both checks. Call this once a day (see server.js scheduler).
 */
async function runDailyTrialCheck() {
  const nudged = await sendNudgeIfDue();
  const { extended, expired, checked } = await resolveExpiringTrials();
  logger.info('Daily trial check complete', { nudged, extended, expired, checked });
  return { nudged, extended, expired, checked };
}

/**
 * Call this at registration to start the clock.
 */
async function startTrial(userId) {
  await pool.query(
    `UPDATE users
     SET trial_started_at = NOW(),
         trial_expires_at = NOW() + INTERVAL '14 days',
         trial_status = 'active'
     WHERE id = $1`,
    [userId]
  );
}

module.exports = {
  getMilestoneProgress,
  sendNudgeIfDue,
  resolveExpiringTrials,
  runDailyTrialCheck,
  startTrial,
  MIN_SESSIONS,
};
