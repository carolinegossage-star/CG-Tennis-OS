const { pool, query } = require('../config/database');
const logger = require('../utils/logger');

const FEATURE_KEY = 'standby_waitlist_auto_fill';
const fixedMessage = (session, player) =>
  `A spot has opened in ${session.label || 'your group session'} at ${session.start_time || 'the scheduled time'}. Reply or tap to claim it — first to confirm gets the spot.`;

async function featureEnabled(coachId) {
  const result = await query(
    `SELECT COALESCE(feature_flags ->> $2, 'true') AS enabled
       FROM coach_profiles WHERE user_id = $1`,
    [coachId, FEATURE_KEY]
  );
  return result.rows[0]?.enabled !== 'false';
}

async function getSessionForCoach(sessionId, coachId) {
  const result = await query(
    `SELECT id, coach_id, session_date, start_time, duration_minutes,
            is_group_session, session_plan
       FROM sessions WHERE id = $1 AND coach_id = $2`,
    [sessionId, coachId]
  );
  return result.rows[0] || null;
}

async function addToQueue(sessionId, coachId, playerId) {
  if (!(await featureEnabled(coachId))) throw Object.assign(new Error('Feature disabled'), { code: 'FEATURE_DISABLED' });
  const session = await getSessionForCoach(sessionId, coachId);
  if (!session) throw Object.assign(new Error('Session not found'), { code: 'SESSION_NOT_FOUND' });
  const player = await query('SELECT id, name FROM players WHERE id = $1 AND coach_id = $2 AND is_active = true', [playerId, coachId]);
  if (!player.rows.length) throw Object.assign(new Error('Player not found'), { code: 'PLAYER_NOT_FOUND' });
  const result = await query(
    `INSERT INTO session_standby_queue (session_id, player_id, queue_position)
     SELECT $1, $2, COALESCE(MAX(queue_position), 0) + 1
       FROM session_standby_queue WHERE session_id = $1
     ON CONFLICT (session_id, player_id) DO NOTHING
     RETURNING *`,
    [sessionId, playerId]
  );
  return result.rows[0] || null;
}

async function listQueue(sessionId, coachId) {
  const session = await getSessionForCoach(sessionId, coachId);
  if (!session) throw Object.assign(new Error('Session not found'), { code: 'SESSION_NOT_FOUND' });
  const result = await query(
    `SELECT q.*, p.name AS player_name FROM session_standby_queue q
      JOIN players p ON p.id = q.player_id
     WHERE q.session_id = $1 ORDER BY q.queue_position`,
    [sessionId]
  );
  return result.rows;
}

async function notifyNext(sessionId, coachId, wholeList = false) {
  if (!(await featureEnabled(coachId))) throw Object.assign(new Error('Feature disabled'), { code: 'FEATURE_DISABLED' });
  const session = await getSessionForCoach(sessionId, coachId);
  if (!session) throw Object.assign(new Error('Session not found'), { code: 'SESSION_NOT_FOUND' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const queue = await client.query(
      `SELECT q.id, q.player_id, q.queue_position, p.name, p.user_id
         FROM session_standby_queue q
         JOIN players p ON p.id = q.player_id
        WHERE q.session_id = $1 AND q.claimed_at IS NULL
        ORDER BY q.queue_position
        FOR UPDATE`,
      [sessionId]
    );
    const recipients = wholeList ? queue.rows : queue.rows.slice(0, 1);
    if (!recipients.length) {
      await client.query('ROLLBACK');
      return [];
    }
    const created = [];
    for (const recipient of recipients) {
      const message = fixedMessage(session, recipient);
      const saved = await client.query(
        `INSERT INTO standby_notifications (queue_id, session_id, player_id, message, sent_at)
         VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
        [recipient.id, sessionId, recipient.player_id, message]
      );
      await client.query(
        `UPDATE session_standby_queue SET notified_at = NOW() WHERE id = $1`,
        [recipient.id]
      );
      created.push({ ...saved.rows[0], player_name: recipient.name, player_user_id: recipient.user_id });
    }
    await client.query('COMMIT');
    logger.info('Standby notification action completed', { coachId, sessionId, count: created.length });
    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function claim(claimToken) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE session_standby_queue
          SET claimed_at = NOW()
        WHERE claim_token = $1 AND claimed_at IS NULL
      RETURNING *`,
      [claimToken]
    );
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return null;
    }
    const claimed = result.rows[0];
    const session = await client.query(
      `UPDATE sessions SET player_id = $1, is_group_session = false
        WHERE id = $2 AND player_id IS NULL
      RETURNING *`,
      [claimed.player_id, claimed.session_id]
    );
    if (!session.rows.length) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query('COMMIT');
    return { queue: claimed, session: session.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { FEATURE_KEY, addToQueue, listQueue, notifyNext, claim };
