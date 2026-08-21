const { query } = require('../config/database');
const logger = require('../utils/logger');

const FEATURE_KEY = 'retention_risk_early_warning';

async function isFeatureEnabled(coachId) {
  const result = await query(
    `SELECT COALESCE(feature_flags ->> $2, 'true') AS enabled
       FROM coach_profiles
      WHERE user_id = $1`,
    [coachId, FEATURE_KEY]
  );
  return result.rows[0]?.enabled !== 'false';
}

async function scanCoach(coachId) {
  if (!(await isFeatureEnabled(coachId))) return { created: 0, skipped: true };

  const candidates = await query(
    `WITH recent_group_sessions AS (
       SELECT p.id AS player_id,
              p.coach_id,
              s.is_completed,
              s.cancelled_reason,
              ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY s.session_date DESC, s.created_at DESC) AS rn
         FROM players p
         JOIN sessions s
           ON s.is_group_session = true
          AND p.id = ANY(s.player_group)
        WHERE p.coach_id = $1
          AND p.is_active = true
     ), group_misses AS (
       SELECT player_id
         FROM recent_group_sessions
        WHERE rn <= 2
        GROUP BY player_id
       HAVING COUNT(*) = 2
          AND BOOL_AND(is_completed = false AND cancelled_reason IS NULL)
     )
     SELECT p.id AS player_id,
            p.coach_id,
            p.name AS player_name,
            CURRENT_DATE - MAX(s.session_date) AS days_since_last_session,
            CASE
              WHEN gm.player_id IS NOT NULL THEN 'two consecutive group sessions missed'
              ELSE 'no completed session in 21 days'
            END AS flag_reason
       FROM players p
       LEFT JOIN sessions s
         ON s.player_id = p.id
        AND s.is_completed = true
       LEFT JOIN group_misses gm ON gm.player_id = p.id
      WHERE p.coach_id = $1
        AND p.is_active = true
      GROUP BY p.id, p.coach_id, p.name, gm.player_id
      HAVING gm.player_id IS NOT NULL
          OR MAX(s.session_date) IS NULL
          OR CURRENT_DATE - MAX(s.session_date) >= 21`,
    [coachId]
  );

  let created = 0;
  for (const candidate of candidates.rows) {
    const inserted = await query(
      `INSERT INTO retention_flags
         (player_id, coach_id, flag_reason, context, dismissed_until)
       SELECT $1, $2, $3, $4, NULL
        WHERE NOT EXISTS (
          SELECT 1 FROM retention_flags
           WHERE player_id = $1 AND resolved_at IS NULL
             AND (dismissed_until IS NULL OR dismissed_until > NOW())
        )
       RETURNING id`,
      [
        candidate.player_id,
        candidate.coach_id,
        candidate.flag_reason,
        JSON.stringify({
          playerName: candidate.player_name,
          daysSinceLastSession: candidate.days_since_last_session,
        }),
      ]
    );
    if (inserted.rows.length) created += 1;
  }
  return { created, skipped: false };
}

async function runDailyScan() {
  const coaches = await query(
    `SELECT DISTINCT p.coach_id
       FROM players p
      WHERE p.is_active = true AND p.coach_id IS NOT NULL`
  );
  let created = 0;
  for (const row of coaches.rows) {
    try {
      const result = await scanCoach(row.coach_id);
      created += result.created;
    } catch (err) {
      logger.error('Retention flag scan failed', { coachId: row.coach_id, error: err.message });
    }
  }
  logger.info('Retention flag daily scan complete', { coaches: coaches.rows.length, created });
  return { coaches: coaches.rows.length, created };
}

async function getCoachFlags(coachId) {
  const result = await query(
    `SELECT rf.*, p.name AS player_name
       FROM retention_flags rf
       JOIN players p ON p.id = rf.player_id
      WHERE rf.coach_id = $1
        AND rf.resolved_at IS NULL
        AND (rf.dismissed_until IS NULL OR rf.dismissed_until <= NOW())
      ORDER BY rf.flagged_at DESC`,
    [coachId]
  );
  return result.rows;
}

async function dismissFlag(flagId, coachId) {
  const result = await query(
    `UPDATE retention_flags
        SET dismissed_until = NOW() + INTERVAL '14 days'
      WHERE id = $1 AND coach_id = $2 AND resolved_at IS NULL
    RETURNING *`,
    [flagId, coachId]
  );
  return result.rows[0] || null;
}

async function resolveFlag(flagId, coachId) {
  const result = await query(
    `UPDATE retention_flags
        SET resolved_at = NOW(), resolved_by_coach = true
      WHERE id = $1 AND coach_id = $2 AND resolved_at IS NULL
    RETURNING *`,
    [flagId, coachId]
  );
  return result.rows[0] || null;
}

module.exports = { FEATURE_KEY, scanCoach, runDailyScan, getCoachFlags, dismissFlag, resolveFlag };
