// ============================================================
// CG Tennis OS™ — APEX COACH AI SUITE™
// Pro tier: filters live tour data through CGTA proprietary frameworks
// © CG Tennis Academies. All Rights Reserved.
// ============================================================

const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FRAMEWORK_CONTEXT = `Available CGTA proprietary frameworks to draw on where relevant:
- Playing To Excel™ — performance foundations
- TennisNLP™ — language patterns and behavioural coaching
- TennisMindset™ — mental performance and mindset
- Fearless Futures™ Tennis — player confidence and growth
- The Concord Framework™ — nervous system regulation under pressure
- Apex Domain Engine™ — applied coaching intelligence`;

// ─── Draw Analysis ─────────────────────────────────────────────────────────────
async function generateDrawAnalysis(coachId, player, styleProfile, eventContext) {
  const prompt = `${FRAMEWORK_CONTEXT}

A coach wants to know which matches in a current tournament draw are worth their player studying this week.

Their player's profile: ${JSON.stringify(styleProfile)}
(e.g. handedness, playing style, surface preference, current development focus)

Tournament context: ${eventContext}

Identify 2-3 matches or matchups worth studying, and explain specifically why — tied to the player's style and development needs. Reference the most relevant framework(s) above where genuinely applicable (don't force it).

Return JSON: {"title": "...", "content": "...", "framework_refs": ["..."], "recommended_actions": [{"action": "...", "due_date": null}]}`;

  return runApexAnalysis(coachId, player?.id, 'draw_analysis', styleProfile, prompt);
}

// ─── Session Plan Link ────────────────────────────────────────────────────────
async function generateSessionPlanLink(coachId, player, styleProfile, tourPattern) {
  const prompt = `${FRAMEWORK_CONTEXT}

A coach wants a specific drill or session focus this week, inspired by a pattern currently visible on tour.

Their player's profile: ${JSON.stringify(styleProfile)}
Tour pattern observed this week: ${tourPattern}

Design ONE specific, practical drill or session focus that connects this tour pattern to this player's development. Be concrete — name the drill, the setup, and the coaching cue. Reference the most relevant CGTA framework where genuinely applicable.

Return JSON: {"title": "...", "content": "...", "framework_refs": ["..."], "recommended_actions": [{"action": "...", "due_date": null}]}`;

  return runApexAnalysis(coachId, player?.id, 'session_plan_link', styleProfile, prompt);
}

// ─── Parent Communications Template ───────────────────────────────────────────
async function generateParentCommsTemplate(coachId, player, scenario) {
  const prompt = `${FRAMEWORK_CONTEXT}

A coach needs to explain a scheduling or development decision to a tennis parent, grounded in real context from the current tour.

Scenario: ${scenario}

Write a warm, professional, reassuring message template the coach can send (or adapt) to the parent. Use TennisNLP™ principles for language choice — calm, confident, non-defensive. Reference real tour context briefly if it strengthens the explanation (e.g. travel load vs match ROI reasoning used by tour pros).

Return JSON: {"title": "...", "content": "...", "framework_refs": ["TennisNLP™"], "recommended_actions": []}`;

  return runApexAnalysis(coachId, player?.id, 'parent_comms_template', {}, prompt);
}

// ─── Style Matchup Report ─────────────────────────────────────────────────────
async function generateStyleMatchupReport(coachId, player, styleProfile, opponentStyleNote) {
  const prompt = `${FRAMEWORK_CONTEXT}

A coach wants a tactical style-matchup briefing for their player ahead of an upcoming match or training matchup.

Their player's profile: ${JSON.stringify(styleProfile)}
Opponent style notes: ${opponentStyleNote}

Provide a short tactical briefing: 2-3 key tactical priorities, and one mental/composure cue tied to The Concord Framework™ or TennisMindset™ if relevant.

Return JSON: {"title": "...", "content": "...", "framework_refs": ["..."], "recommended_actions": [{"action": "...", "due_date": null}]}`;

  return runApexAnalysis(coachId, player?.id, 'style_matchup_report', styleProfile, prompt);
}

// ─── Shared Runner ─────────────────────────────────────────────────────────────
async function runApexAnalysis(coachId, playerId, analysisType, styleProfile, prompt) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0]?.text || '';
    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      parsed = { title: 'Apex Coach Analysis', content: raw, framework_refs: [], recommended_actions: [] };
    }

    const result = await query(`
      INSERT INTO apex_coach_analyses (
        coach_id, player_id, analysis_type, player_style_profile,
        title, content, framework_refs, recommended_actions
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [
      coachId, playerId || null, analysisType, JSON.stringify(styleProfile || {}),
      parsed.title, parsed.content,
      parsed.framework_refs || [], JSON.stringify(parsed.recommended_actions || []),
    ]);

    return result.rows[0];
  } catch (err) {
    logger.error('Apex analysis generation failed', { error: err.message, analysisType });
    throw err;
  }
}

// ─── Subscription Gate Check ──────────────────────────────────────────────────
async function requiresActiveSubscription(userId) {
  const result = await query(
    'SELECT subscription_tier, subscription_status FROM users WHERE id = $1',
    [userId]
  );
  const user = result.rows[0];
  return user?.subscription_tier === 'apex_coach_suite' && user?.subscription_status === 'active';
}

// ─── History ───────────────────────────────────────────────────────────────────
async function getHistory(coachId, limit = 20) {
  const result = await query(`
    SELECT aca.*, p.name as player_name, te.name as event_name
    FROM apex_coach_analyses aca
    LEFT JOIN players p ON p.id = aca.player_id
    LEFT JOIN tour_events te ON te.id = aca.event_id
    WHERE aca.coach_id = $1
    ORDER BY aca.created_at DESC
    LIMIT $2
  `, [coachId, limit]);
  return result.rows;
}

module.exports = {
  generateDrawAnalysis,
  generateSessionPlanLink,
  generateParentCommsTemplate,
  generateStyleMatchupReport,
  requiresActiveSubscription,
  getHistory,
};
