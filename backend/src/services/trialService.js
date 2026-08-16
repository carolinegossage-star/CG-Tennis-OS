/**
 * Trial Activation Service
 *
 * Every coach receives a 14-day trial. Coaches who genuinely use the system
 * earn the existing automatic 7-day extension. This file remains the sole
 * owner of trial scheduling and trial state.
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
         AND ((reflection_text IS NOT NULL AND reflection_text <> '')
           OR reflection_voice_url IS NOT NULL
           OR (reflection_checklist IS NOT NULL AND reflection_checklist::text <> '{}'))`,
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

async function sendDay7Nudges() {
  const { rows: candidates } = await pool.query(
    `SELECT id, email, name
       FROM users
      WHERE role = 'coach'
        AND trial_status = 'active'
        AND trial_day7_nudge_sent_at IS NULL
        AND trial_started_at <= NOW() - INTERVAL '7 days'
        AND trial_started_at > NOW() - INTERVAL '13 days'`
  );
  let sent = 0;
  for (const coach of candidates) {
    try {
      const progress = await getMilestoneProgress(coach.id);
      await emailService.sendTrialDay7Email(coach.email, coach.name, progress);
      await pool.query('UPDATE users SET trial_day7_nudge_sent_at = NOW() WHERE id = $1', [coach.id]);
      await logEvent(coach.id, 'day7_nudge_sent', { progress });
      sent += 1;
    } catch (err) {
      logger.error('Day-7 trial nudge failed', { userId: coach.id, error: err.message });
    }
  }
  return sent;
}

async function sendDay13Nudges() {
  const { rows: candidates } = await pool.query(
    `SELECT id, email, name
       FROM users
      WHERE role = 'coach'
        AND trial_status = 'active'
        AND trial_day13_nudge_sent_at IS NULL
        AND trial_started_at <= NOW() - INTERVAL '13 days'
        AND trial_started_at > NOW() - INTERVAL '14 days'`
  );
  let sent = 0;
  for (const coach of candidates) {
    try {
      await emailService.sendTrialDay13Email(coach.email, coach.name);
      await pool.query('UPDATE users SET trial_day13_nudge_sent_at = NOW() WHERE id = $1', [coach.id]);
      await logEvent(coach.id, 'day13_nudge_sent');
      sent += 1;
    } catch (err) {
      logger.error('Day-13 trial nudge failed', { userId: coach.id, error: err.message });
    }
  }
  return sent;
}

// Existing day-10 milestone nudge is retained as a separate retention touch.
async function sendNudgeIfDue() {
  const { rows: candidates } = await pool.query(
    `SELECT id, email, name
       FROM users
      WHERE role = 'coach'
        AND trial_status = 'active'
        AND trial_nudge_sent_at IS NULL
        AND trial_started_at <= NOW() - INTERVAL '10 days'
        AND trial_started_at > NOW() - INTERVAL '14 days'`
  );
  let sent = 0;
  for (const coach of candidates) {
    const progress = await getMilestoneProgress(coach.id);
    if (progress.qualified) continue;
    const missing = [];
    if (!progress.playerAdded) missing.push('add a player profile');
    if (!progress.sessionsPlanned) missing.push(`plan ${MIN_SESSIONS} sessions`);
    if (!progress.reflectionDone) missing.push('complete a session reflection');
    try {
      await emailService.sendTrialNudgeEmail(coach.email, coach.name, missing);
      await pool.query('UPDATE users SET trial_nudge_sent_at = NOW() WHERE id = $1', [coach.id]);
      await logEvent(coach.id, 'nudge_sent', { missing });
      sent += 1;
    } catch (err) {
      logger.error('Trial nudge failed to send', { userId: coach.id, error: err.message });
    }
  }
  return sent;
}

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
      await pool.query("UPDATE users SET trial_status = 'expired' WHERE id = $1", [coach.id]);
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

async function runDailyTrialCheck() {
  const day7 = await sendDay7Nudges();
  const day10 = await sendNudgeIfDue();
  const day13 = await sendDay13Nudges();
  const { extended, expired, checked } = await resolveExpiringTrials();
  const nudged = day7 + day10 + day13;
  logger.info('Daily trial check complete', { nudged, day7, day10, day13, extended, expired, checked });
  return { nudged, day7, day10, day13, extended, expired, checked };
}

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
  sendDay7Nudges,
  sendDay13Nudges,
  sendNudgeIfDue,
  resolveExpiringTrials,
  runDailyTrialCheck,
  startTrial,
  MIN_SESSIONS,
};
