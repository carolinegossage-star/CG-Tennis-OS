const { query } = require('../config/database');
const emailService = require('./emailService');
const wsService = require('./wsService');
const logger = require('../utils/logger');

// ─── Create Alert ──────────────────────────────────────────────────────────────
async function createAlert(data) {
  const {
    userId, relatedPlayerId, relatedTournamentId,
    alertType, severity, title, message,
    actionUrl, actionLabel, metadata = {}
  } = data;

  const result = await query(`
    INSERT INTO alerts (
      user_id, related_player_id, related_tournament_id,
      alert_type, severity, title, message,
      action_url, action_label, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
  `, [
    userId, relatedPlayerId || null, relatedTournamentId || null,
    alertType, severity, title, message,
    actionUrl || null, actionLabel || null, JSON.stringify(metadata)
  ]);

  const alert = result.rows[0];

  // Push via WebSocket if user is connected
  wsService.sendToUser(userId, { type: 'NEW_ALERT', alert });

  // Send email for urgent alerts
  if (severity === 'urgent') {
    const userResult = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length) {
      emailService.sendAlertEmail(userResult.rows[0], alert).catch(e =>
        logger.warn('Alert email failed', { error: e.message })
      );
    }
  }

  logger.info('Alert created', { alertId: alert.id, severity, type: alertType });
  return alert;
}

// ─── Schedule Deadline Alerts for a Tournament Entry ──────────────────────────
async function scheduleDeadlineAlerts(coachId, tournamentId) {
  const result = await query(
    'SELECT * FROM tournaments WHERE id = $1',
    [tournamentId]
  );
  if (!result.rows.length) return;
  const tournament = result.rows[0];

  if (!tournament.entry_deadline) return;

  const today = new Date();
  const deadline = new Date(tournament.entry_deadline);
  const daysUntil = Math.ceil((deadline - today) / 86400000);

  if (daysUntil <= 7 && daysUntil > 2) {
    await createAlert({
      userId: coachId,
      relatedTournamentId: tournamentId,
      alertType: 'tournament_deadline',
      severity: 'warning',
      title: `Entry deadline in ${daysUntil} days — ${tournament.name}`,
      message: `The entry deadline for ${tournament.name} is on ${tournament.entry_deadline}. Please confirm your player's entry and payment.`,
      actionUrl: `/tournaments/${tournamentId}`,
      actionLabel: 'View Tournament',
      metadata: { daysUntil, tournament_name: tournament.name },
    });
  } else if (daysUntil <= 2) {
    await createAlert({
      userId: coachId,
      relatedTournamentId: tournamentId,
      alertType: 'tournament_deadline',
      severity: 'urgent',
      title: `⚠️ URGENT: Entry deadline in ${daysUntil <= 0 ? 'TODAY' : daysUntil + ' days'} — ${tournament.name}`,
      message: `URGENT: The entry deadline for ${tournament.name} is ${daysUntil <= 0 ? 'today' : 'in ' + daysUntil + ' days'}. Immediate action required.`,
      actionUrl: `/tournaments/${tournamentId}`,
      actionLabel: 'Act Now',
      metadata: { daysUntil, tournament_name: tournament.name },
    });
  }
}

// ─── Process Rule Action → Alert ──────────────────────────────────────────────
async function processRuleAction(action, context) {
  if (action.type !== 'create_alert') return;

  const templates = {
    burnout_risk_detected: {
      title: 'Burnout Risk Detected',
      message: `Player showing signs of burnout — enjoyment score has dropped below threshold. Consider reducing load and scheduling a one-to-one welfare check.`,
      alertType: 'burnout_risk',
    },
    dropout_risk_detected: {
      title: 'Dropout Risk Flagged',
      message: `Player has missed ${context.sessions_missed_last_30_days || 'multiple'} sessions this month. Proactive contact recommended before this becomes a departure.`,
      alertType: 'dropout_risk',
    },
    dropout_risk_critical: {
      title: '🚨 Critical Dropout Risk',
      message: `No session activity for ${context.days_since_last_session} days. Immediate outreach required. Contact parent/guardian today.`,
      alertType: 'dropout_risk',
    },
    tournament_deadline_urgent: {
      title: '⚠️ Tournament Deadline — Urgent',
      message: 'Entry deadline approaching. Immediate action required.',
      alertType: 'tournament_deadline',
    },
  };

  const template = templates[action.template];
  if (!template) return;

  await createAlert({
    userId: context.coach_id,
    relatedPlayerId: context.player_id,
    alertType: template.alertType,
    severity: action.severity || 'warning',
    title: template.title,
    message: template.message,
    metadata: context,
  });
}

// ─── Get Alerts for User ───────────────────────────────────────────────────────
async function getUserAlerts(userId, unreadOnly = false, limit = 50) {
  let sql = `
    SELECT a.*,
      p.name as player_name,
      t.name as tournament_name
    FROM alerts a
    LEFT JOIN players p ON p.id = a.related_player_id
    LEFT JOIN tournaments t ON t.id = a.related_tournament_id
    WHERE a.user_id = $1 AND a.resolved_at IS NULL
  `;
  const params = [userId];
  if (unreadOnly) sql += ' AND a.is_read = false';
  sql += ' ORDER BY CASE a.severity WHEN \'urgent\' THEN 1 WHEN \'warning\' THEN 2 ELSE 3 END, a.created_at DESC';
  sql += ` LIMIT $2`;
  params.push(limit);

  const result = await query(sql, params);
  return result.rows;
}

// ─── Resolve Alert ─────────────────────────────────────────────────────────────
async function resolveAlert(alertId, userId, resolutionNote) {
  const result = await query(`
    UPDATE alerts SET
      resolved_at = NOW(), resolved_by = $1, resolution_note = $2, is_read = true
    WHERE id = $3 AND user_id = $4
    RETURNING *
  `, [userId, resolutionNote || null, alertId, userId]);
  return result.rows[0];
}

// ─── Daily Deadline Scan (run via cron) ───────────────────────────────────────
async function runDailyDeadlineScan() {
  logger.info('Running daily deadline scan...');
  try {
    // Get all active tournament entries where deadline is approaching
    const result = await query(`
      SELECT te.coach_id, te.tournament_id, t.entry_deadline, t.name,
             t.entry_deadline - CURRENT_DATE as days_until
      FROM tournament_entries te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE te.entry_status NOT IN ('withdrawn', 'confirmed')
        AND t.entry_deadline IS NOT NULL
        AND t.entry_deadline >= CURRENT_DATE
        AND t.entry_deadline - CURRENT_DATE <= 7
    `);

    for (const row of result.rows) {
      await scheduleDeadlineAlerts(row.coach_id, row.tournament_id);
    }

    logger.info(`Deadline scan complete — ${result.rows.length} entries checked`);
  } catch (err) {
    logger.error('Daily deadline scan error', { error: err.message });
  }
}

module.exports = {
  createAlert,
  scheduleDeadlineAlerts,
  processRuleAction,
  getUserAlerts,
  resolveAlert,
  runDailyDeadlineScan,
};
