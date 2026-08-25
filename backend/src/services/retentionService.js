const { query } = require('../config/database');
const alertService = require('./alertService');
const rulesEngine = require('../rules/rulesEngine');
const logger = require('../utils/logger');

// ─── Record Session Metrics & Run Risk Evaluation ────────────────────────────
async function recordSessionMetrics(session) {
  if (!session.player_id) return;

  try {
    // Get recent sessions to calculate trends
    const recentSessions = await query(`
      SELECT s.enjoyment_score, s.engagement_score, s.session_date, s.is_completed
      FROM session_participants sp
      JOIN sessions s ON s.id = sp.session_id
      WHERE sp.player_id = $1
        AND sp.participation_status = 'attended'
        AND s.is_completed = true
      ORDER BY s.session_date DESC LIMIT 10
    `, [session.player_id]);

    const rows = recentSessions.rows;
    const avgEnjoyment = rows.reduce((sum, r) => sum + (parseFloat(r.enjoyment_score) || 0), 0) / (rows.length || 1);
    const avgEngagement = rows.reduce((sum, r) => sum + (parseFloat(r.engagement_score) || 0), 0) / (rows.length || 1);

    // Count sessions missed in last 30 days
    const missedResult = await query(`
      SELECT COUNT(*)
      FROM session_participants sp
      JOIN sessions s ON s.id = sp.session_id
      WHERE sp.player_id = $1
        AND s.session_date >= CURRENT_DATE - INTERVAL '30 days'
        AND (
          sp.participation_status = 'absent'
          OR (sp.participation_status = 'scheduled' AND s.session_date < CURRENT_DATE)
        )
    `, [session.player_id]);
    const sessionsMissed = parseInt(missedResult.rows[0].count);

    // Days since last session
    const daysSinceResult = await query(`
      SELECT CURRENT_DATE - MAX(s.session_date) as days_since
      FROM session_participants sp
      JOIN sessions s ON s.id = sp.session_id
      WHERE sp.player_id = $1
        AND sp.participation_status = 'attended'
        AND s.is_completed = true
    `, [session.player_id]);
    const daysSince = parseInt(daysSinceResult.rows[0]?.days_since) || 0;

    // Evaluate rules
    const ruleInput = {
      enjoyment_score_avg_last_3: avgEnjoyment,
      engagement_score_avg: avgEngagement,
      sessions_missed_last_30_days: sessionsMissed,
      days_since_last_session: daysSince,
      player_id: session.player_id,
      coach_id: session.coach_id,
    };

    const { burnoutRisk, dropoutRisk, actions } = await rulesEngine.evaluate(ruleInput, ['burnout', 'dropout']);

    // Write retention metric record
    await query(`
      INSERT INTO retention_metrics (
        player_id, coach_id, enjoyment_score, engagement_score,
        attendance_rate, burnout_risk, dropout_risk, risk_factors
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      session.player_id, session.coach_id,
      session.enjoyment_score, session.engagement_score,
      sessionsMissed > 0 ? Math.max(0, 100 - (sessionsMissed * 25)) : 100,
      burnoutRisk, dropoutRisk,
      JSON.stringify(ruleInput)
    ]);

    // Update player risk levels
    await query(`
      UPDATE players SET
        burnout_risk_level = $1,
        dropout_risk_level = $2,
        enjoyment_score = $3,
        engagement_score = $4
      WHERE id = $5
    `, [burnoutRisk, dropoutRisk, session.enjoyment_score, session.engagement_score, session.player_id]);

    // Execute triggered actions (create alerts etc.)
    for (const action of actions) {
      await alertService.processRuleAction(action, ruleInput);
    }

    logger.info('Retention metrics recorded', {
      playerId: session.player_id,
      burnoutRisk,
      dropoutRisk,
    });
  } catch (err) {
    logger.error('Retention service error', { error: err.message });
    throw err;
  }
}

// ─── Get Player Risk Summary ──────────────────────────────────────────────────
async function getPlayerRiskSummary(playerId) {
  const [player, metrics, sessions] = await Promise.all([
    query('SELECT * FROM players WHERE id = $1', [playerId]),
    query(`
      SELECT * FROM retention_metrics
      WHERE player_id = $1 ORDER BY recorded_date DESC LIMIT 10
    `, [playerId]),
    query(`
      SELECT s.session_date, s.enjoyment_score, s.engagement_score, s.is_completed,
        sp.participation_status, sp.attendance_note
      FROM session_participants sp
      JOIN sessions s ON s.id = sp.session_id
      WHERE sp.player_id = $1
      ORDER BY s.session_date DESC LIMIT 20
    `, [playerId]),
  ]);

  const p = player.rows[0];
  if (!p) throw new Error('Player not found');

  const mRows = metrics.rows;
  const sRows = sessions.rows;

  // Trend: is enjoyment going up or down?
  const enjoymentTrend = mRows.length >= 2
    ? mRows[0].enjoyment_score - mRows[mRows.length - 1].enjoyment_score
    : 0;

  return {
    playerId,
    playerName: p.name,
    currentRisks: {
      burnout: p.burnout_risk_level,
      dropout: p.dropout_risk_level,
    },
    currentScores: {
      enjoyment: p.enjoyment_score,
      engagement: p.engagement_score,
    },
    trends: {
      enjoymentTrend: enjoymentTrend > 0 ? 'improving' : enjoymentTrend < 0 ? 'declining' : 'stable',
      enjoymentTrendValue: parseFloat(enjoymentTrend.toFixed(2)),
    },
    recentMetrics: mRows.slice(0, 5),
    sessionHistory: sRows,
    recommendations: generateInterventionRecommendations(p, mRows),
  };
}

// ─── Intervention Recommendations ────────────────────────────────────────────
function generateInterventionRecommendations(player, metrics) {
  const recs = [];
  const burnout = player.burnout_risk_level;
  const dropout = player.dropout_risk_level;

  if (burnout === 'critical' || dropout === 'critical') {
    recs.push({
      priority: 'urgent',
      type: 'parent_contact',
      title: 'Contact Parent/Guardian Today',
      description: 'Critical risk detected. Arrange an immediate three-way conversation (coach, player, parent).',
    });
    recs.push({
      priority: 'urgent',
      type: 'session_redesign',
      title: 'Redesign Next Session — Fun First',
      description: 'Remove all competitive pressure. Design a session focused entirely on enjoyment and reconnection.',
    });
  }

  if (burnout === 'high') {
    recs.push({
      priority: 'high',
      type: 'load_reduction',
      title: 'Reduce Training Load',
      description: 'Consider reducing session frequency or intensity for 2-3 weeks. Monitor enjoyment weekly.',
    });
    recs.push({
      priority: 'high',
      type: 'goal_reset',
      title: 'Reset Short-Term Goals',
      description: 'Revisit the player\'s "why". Reconnect with intrinsic motivation using TennisMindset™ framework.',
    });
  }

  if (dropout === 'high') {
    recs.push({
      priority: 'high',
      type: 're_engagement',
      title: 'Re-engagement Session',
      description: 'Schedule an informal, low-pressure session. Let the player choose the activities.',
    });
  }

  if (player.enjoyment_score < 6 && player.engagement_score > 7) {
    recs.push({
      priority: 'medium',
      type: 'variety',
      title: 'Introduce More Variety',
      description: 'Engagement is strong but enjoyment is dropping — add novel drills and game formats.',
    });
  }

  if (!recs.length) {
    recs.push({
      priority: 'low',
      type: 'maintain',
      title: 'Continue Current Approach',
      description: 'Player is showing healthy engagement and enjoyment. Maintain current session structure.',
    });
  }

  return recs;
}

// ─── Retention Analytics for Coach Dashboard ──────────────────────────────────
async function getCoachRetentionAnalytics(coachId, periodDays = 90) {
  const result = await query(`
    SELECT
      COUNT(DISTINCT p.id) as total_players,
      COUNT(DISTINCT CASE WHEN p.burnout_risk_level IN ('high','critical') THEN p.id END) as high_burnout_count,
      COUNT(DISTINCT CASE WHEN p.dropout_risk_level IN ('high','critical') THEN p.id END) as high_dropout_count,
      AVG(p.enjoyment_score) as avg_enjoyment,
      AVG(p.engagement_score) as avg_engagement,
      AVG(p.confidence_score) as avg_confidence,
      AVG(p.resilience_score) as avg_resilience
    FROM players p
    WHERE p.coach_id = $1 AND p.is_active = true
  `, [coachId]);

  const riskPlayers = await query(`
    SELECT id, name, burnout_risk_level, dropout_risk_level, enjoyment_score, engagement_score
    FROM players
    WHERE coach_id = $1
      AND is_active = true
      AND (burnout_risk_level IN ('high','critical') OR dropout_risk_level IN ('high','critical'))
    ORDER BY
      CASE burnout_risk_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
      CASE dropout_risk_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END
  `, [coachId]);

  return {
    summary: result.rows[0],
    atRiskPlayers: riskPlayers.rows,
  };
}

module.exports = { recordSessionMetrics, getPlayerRiskSummary, getCoachRetentionAnalytics };
