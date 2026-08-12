const aiService = require('./aiService');
const { query } = require('../config/database');
const logger = require('../utils/logger');

async function generateReflectionSummary(session) {
  return aiService.generateReflectionSummary(session);
}

async function getMarginalGainsTrend(coachId, days = 90) {
  const result = await query(`
    SELECT s.session_date, s.player_id, p.name as player_name,
           gain->>'area' as area,
           gain->>'before' as before_value,
           gain->>'after' as after_value,
           gain->>'notes' as notes
    FROM sessions s
    CROSS JOIN LATERAL jsonb_array_elements(s.marginal_gains_tracked) as gain
    LEFT JOIN players p ON p.id = s.player_id
    WHERE s.coach_id = $1 AND s.session_date >= NOW() - ($2 || ' days')::INTERVAL
    ORDER BY s.session_date DESC
  `, [coachId, days]);
  return result.rows;
}

module.exports = { generateReflectionSummary, getMarginalGainsTrend };
