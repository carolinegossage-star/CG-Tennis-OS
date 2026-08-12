const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('../config/database');
const logger = require('../utils/logger');
const knowledgeService = require('./knowledgeService');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Core AI Query ─────────────────────────────────────────────────────────────
async function queryAI(userId, userQuery, contextData = {}) {
  const start = Date.now();

  const systemPrompt = `You are Coach Caroline G, the AI coaching intelligence engine embedded in the CG Tennis OS — a professional tennis coaching management system designed for high-performance coaches.

Coach Caroline G embodies the philosophy: "Joy is the Advantage." You are not a generic AI assistant; you are an extension of Caroline's proprietary coaching frameworks and methodology.

You draw on evidence-based sports psychology, long-term athlete development (LTAD), and the following proprietary frameworks:
- Playing To Excel™ (1995) — performance foundations
- TennisNLP™ (2011) — language patterns and behavioural coaching
- TennisMindset™ (2016) — mental performance and mindset
- Fearless Futures™ Tennis (2018) — player confidence and growth
- The Concord Framework™ (2020) — nervous system regulation and performance under pressure

You are concise, practical, and speak directly to coaches. You never give generic advice — always specific, actionable recommendations based on the context provided.

When analysing player risk (burnout, dropout), you reference specific data points. When suggesting session plans, you consider the coach's environment constraints. When advising on pricing, you consider the UK tennis market.

Always maintain professional tone appropriate for a senior LTA licensed coach.

Your responses MUST be traceable to the provided knowledge base, specifically Playing To Excel™ and TennisNLP™.

Remember: You are Coach Caroline G. Every response should reflect her unique voice, her commitment to joy-based coaching, and her proprietary frameworks. You are not generic tennis advice — you are Caroline's coaching intelligence.`;

  const contextString = Object.keys(contextData).length
    ? `\n\nRelevant context:\n${JSON.stringify(contextData, null, 2)}`
    : '';

  const relevantKnowledge = knowledgeService.getRelevantKnowledge(userQuery, ["PlayingToExcelManifesto", "TennisNLP™_Anchor_Page", "PlayingtoExcel-PerformancePillarRef-Library", "PlayingToExcel-CompanionLayer-1stprescriptionlibrary", "TennisNLPLanguageBank-Phaseonebuild", "PlayingToExcelHOWareyouascoach-Layer3", "CGTennisOSVoiceLibrary", "CGtennisOS-NudgeScripts"]);
  const knowledgeString = relevantKnowledge ? `\n\nProprietary Knowledge Base:\n${relevantKnowledge}` : '';

  const messages = [
    { role: 'user', content: userQuery + contextString + knowledgeString },
  ];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: systemPrompt,
    messages: messages,
  });

  const aiResponse = response.content[0]?.text || '';
  const latency = Date.now() - start;

  // Log the interaction
  const logResult = await query(`
    INSERT INTO ai_assist_logs (user_id, query, response, context, tokens_used, model, latency_ms)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
  `, [
    userId, userQuery, aiResponse,
    JSON.stringify(contextData),
    response.usage?.input_tokens + response.usage?.output_tokens || 0,
    'claude-sonnet-4-6',
    latency
  ]);

  logger.info('Coach Caroline G query completed', { userId, latency, logId: logResult.rows[0].id });

  return {
    response: aiResponse,
    logId: logResult.rows[0].id,
    tokensUsed: response.usage?.input_tokens + response.usage?.output_tokens || 0,
  };
}

// ─── Generate Reflection Summary ──────────────────────────────────────────────
async function generateReflectionSummary(session) {
  const prompt = `Generate a concise coaching reflection summary (max 200 words) based on this session data:\n\nSession Date: ${session.session_date}\nDuration: ${session.duration_minutes} minutes\nEnvironment: ${session.environment_type}\nFrameworks Used: ${(session.frameworks_used || []).join(', ')}\n\nReflection: ${session.reflection_text || 'No written reflection provided'}\nDebrief: ${JSON.stringify(session.debrief_data || {})}\nEnjoyment Score: ${session.enjoyment_score}/10\nEngagement Score: ${session.engagement_score}/10\nMarginal Gains: ${JSON.stringify(session.marginal_gains_tracked || [])}\n\nProvide: 1) Key insight from this session, 2) One specific action for next session, 3) Any risk indicators to watch.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0]?.text || '';
  } catch (err) {
    logger.warn('Coach Caroline G reflection summary generation failed', { error: err.message });
    return null;
  }
}

// ─── Generate Session Plan ────────────────────────────────────────────────────
async function generateSessionPlan(coachProfile, player, sessionConfig) {
  const prompt = `Create a structured 60-minute tennis session plan for the following:\n\nCoach Profile:\n- Environment: ${(coachProfile.environment_types || []).join(', ')}\n- Frameworks: TennisNLP™, TennisMindset™, Playing To Excel™\n- Positioning: ${coachProfile.positioning_niche || 'performance coaching'}\n\nPlayer:\n- Name: ${player.name}\n- Age: ${player.date_of_birth ? Math.floor((Date.now() - new Date(player.date_of_birth)) / 31557600000) : 'unknown'}\n- Current Enjoyment: ${player.enjoyment_score || 'N/A'}/10\n- Burnout Risk: ${player.burnout_risk_level}\n- Confidence: ${player.confidence_score || 'N/A'}/10\n\nSession Config:\n- Duration: ${sessionConfig.duration || 60} minutes\n- Focus: ${sessionConfig.focus || 'general performance'}\n- Surface: ${sessionConfig.surface || 'hard court'}\n- Equipment Available: ${sessionConfig.equipment || 'full'}\n\nReturn a structured plan with: warm-up, technical work, tactical work, match play/games, cool-down. Include specific drill names, timing, coaching cues, and one TennisMindset™ activation exercise.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0]?.text || '';
  } catch (err) {
    logger.warn('Coach Caroline G session plan generation failed', { error: err.message });
    return null;
  }
}

// ─── Generate Business Intelligence Insight ───────────────────────────────────
async function generateBusinessInsight(coachProfile, metrics) {
  const prompt = `Provide a concise business intelligence summary for this tennis coach:\n\nMetrics:\n- Player Count: ${metrics.player_count || 0}\n- Monthly Revenue: £${metrics.revenue || 0}\n- Retention Rate: ${metrics.retention_rate || 0}%\n- Churn Rate: ${metrics.churn_rate || 0}%\n- Avg Enjoyment Score: ${metrics.avg_enjoyment || 0}/10\n- Current Pricing Model: ${coachProfile.pricing_model || 'per session'}\n- Hourly Rate: £${coachProfile.hourly_rate || 0}\n\nUK Tennis coaching market context: Premium private coaching £60-120/hr, academy rates vary, school contracts £30-50/hr.\n\nProvide: 1) Revenue optimisation recommendation, 2) Retention insight, 3) One pricing adjustment to consider. Keep to 150 words.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0]?.text || '';
  } catch (err) {
    logger.warn('Coach Caroline G business insight generation failed', { error: err.message });
    return null;
  }
}

// ─── Get AI History ───────────────────────────────────────────────────────────
async function getHistory(userId, limit = 20) {
  const result = await query(`
    SELECT id, query, response, tokens_used, was_helpful, created_at
    FROM ai_assist_logs
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [userId, limit]);
  return result.rows;
}

// ─── Mark AI Response Helpfulness ─────────────────────────────────────────────
async function markHelpful(logId, userId, wasHelpful) {
  await query(
    'UPDATE ai_assist_logs SET was_helpful = $1 WHERE id = $2 AND user_id = $3',
    [wasHelpful, logId, userId]
  );
}

module.exports = {
  queryAI,
  generateReflectionSummary,
  generateSessionPlan,
  generateBusinessInsight,
  getHistory,
  markHelpful,
};
