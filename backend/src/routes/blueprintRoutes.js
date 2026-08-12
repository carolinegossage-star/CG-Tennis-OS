// ============================================================
// CG Tennis OS™ — ADDITIONAL SERVICES (Blueprint Gap-Fill)
// Coaching Identity · Behavioural Intelligence · Learning Engine
// Business OS · Community · Predictions · Achievements
// © CG Tennis Academies. All Rights Reserved.
// ============================================================

const express = require('express');
const { query, cache } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const aiService = require('../services/aiService');
const logger = require('../utils/logger');

// ─── COACHING IDENTITY ROUTER ─────────────────────────────────────────────────
const identityRouter = express.Router();

// GET /coaching-identity/:user_id — full identity profile
identityRouter.get('/:user_id', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT cp.*,
        json_agg(DISTINCT cm.*) FILTER (WHERE cm.id IS NOT NULL) as milestones,
        json_agg(DISTINCT caa.*) FILTER (WHERE caa.id IS NOT NULL) as assessments
      FROM coach_profiles cp
      LEFT JOIN career_milestones cm ON cm.coach_id = cp.user_id
      LEFT JOIN coaching_archetype_assessments caa ON caa.coach_id = cp.user_id
      WHERE cp.user_id = $1
      GROUP BY cp.id
    `, [req.params.user_id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Identity fetch error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch coaching identity' });
  }
});

// POST /coaching-identity/archetype-assessment — submit assessment responses
identityRouter.post('/archetype-assessment', authenticate, async (req, res) => {
  const { responses } = req.body;
  if (!responses) return res.status(400).json({ error: 'Responses required' });

  try {
    // Score archetypes via AI
    const prompt = `A tennis coach has completed an archetype assessment. Based on their responses, determine their primary coaching archetype from this list:
    - The Transformational Leader (inspires, vision-driven, builds culture)
    - The Technical Architect (systems, precision, structured development)  
    - The Relationship Builder (connection-first, empathy, family feel)
    - The Performance Scientist (data-driven, evidence-based, analytical)
    - The Community Champion (inclusivity, accessibility, grass-roots)
    - The Business Builder (sustainable career, systems, growth-minded)
    
    Responses: ${JSON.stringify(responses)}
    
    Return JSON only: {"archetype": "name", "scores": {"archetype_name": score_0_100}, "summary": "2 sentence description", "strengths": ["str1","str2","str3"], "growth_areas": ["area1","area2"]}`;

    const aiResult = await aiService.queryAI(req.user.id, prompt, { type: 'archetype_assessment' });
    let archetypeData;
    try {
      archetypeData = JSON.parse(aiResult.response.replace(/```json|```/g, '').trim());
    } catch {
      archetypeData = { archetype: 'The Transformational Leader', scores: {}, summary: aiResult.response };
    }

    const result = await query(`
      INSERT INTO coaching_archetype_assessments (coach_id, responses, archetype_result, archetype_scores, completed_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `, [req.user.id, JSON.stringify(responses), archetypeData.archetype, JSON.stringify(archetypeData.scores)]);

    // Update coach profile with archetype result
    await query(`
      UPDATE coach_profiles SET archetype = $1, archetype_assessment_complete = true WHERE user_id = $2
    `, [archetypeData.archetype, req.user.id]);

    res.status(201).json({ assessment: result.rows[0], archetypeData });
  } catch (err) {
    logger.error('Archetype assessment error', { error: err.message });
    res.status(500).json({ error: 'Assessment failed' });
  }
});

// POST /coaching-identity/uvp-builder — AI-powered UVP generation
identityRouter.post('/uvp-builder', authenticate, async (req, res) => {
  try {
    const profileResult = await query('SELECT * FROM coach_profiles WHERE user_id = $1', [req.user.id]);
    const profile = profileResult.rows[0];

    const prompt = `Create a compelling Unique Value Proposition (UVP) for this tennis coach to use on their website and marketing:

Coach Profile:
- Archetype: ${profile?.archetype || 'unknown'}
- Philosophy: ${profile?.philosophy || 'not set'}
- Environment: ${(profile?.environment_types || []).join(', ')}
- Experience: ${profile?.years_experience || 'N/A'} years
- Niche: ${profile?.positioning_niche || 'general coaching'}
- Values: ${JSON.stringify(profile?.coaching_values || [])}

Create 3 UVP options — short (1 sentence), medium (2-3 sentences), and full (a punchy paragraph). 
Each should be authentic, differentiated, and not generic.
Return JSON: {"short": "...", "medium": "...", "full": "..."}`;

    const result = await aiService.queryAI(req.user.id, prompt, { type: 'uvp_builder' });
    let uvpOptions;
    try {
      uvpOptions = JSON.parse(result.response.replace(/```json|```/g, '').trim());
    } catch {
      uvpOptions = { short: result.response, medium: result.response, full: result.response };
    }

    res.json({ uvpOptions });
  } catch (err) {
    res.status(500).json({ error: 'UVP generation failed' });
  }
});

// POST /coaching-identity/milestones
identityRouter.post('/milestones', authenticate, async (req, res) => {
  const { title, description, milestone_type, achieved_date, is_public } = req.body;
  try {
    const result = await query(`
      INSERT INTO career_milestones (coach_id, title, description, milestone_type, achieved_date, is_public)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [req.user.id, title, description || null, milestone_type || null, achieved_date || null, is_public || false]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add milestone' });
  }
});

// ─── BEHAVIOURAL INTELLIGENCE ROUTER ─────────────────────────────────────────
const behaviouralRouter = express.Router();

// GET /behavioural/:player_id
behaviouralRouter.get('/player/:player_id', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM behavioural_profiles WHERE subject_id = $1 AND subject_type = $2',
      [req.params.player_id, 'player']
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch behavioural profile' });
  }
});

// POST /behavioural/player/:player_id — create/update behavioural profile
behaviouralRouter.post('/player/:player_id', authenticate, async (req, res) => {
  const {
    learning_style, communication_style, personality_type,
    emotional_regulation, fear_response_patterns, confidence_triggers,
    stress_indicators, regulation_strategies,
    parent_involvement_level, parent_coaching_notes, parent_protocol_active
  } = req.body;
  try {
    const result = await query(`
      INSERT INTO behavioural_profiles (
        subject_id, subject_type, coach_id, learning_style, communication_style,
        personality_type, emotional_regulation, fear_response_patterns, confidence_triggers,
        stress_indicators, regulation_strategies, parent_involvement_level,
        parent_coaching_notes, parent_protocol_active, last_assessed
      ) VALUES ($1,'player',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
      ON CONFLICT (subject_id, subject_type) DO UPDATE SET
        learning_style = EXCLUDED.learning_style,
        communication_style = EXCLUDED.communication_style,
        emotional_regulation = EXCLUDED.emotional_regulation,
        last_assessed = NOW()
      RETURNING *
    `, [
      req.params.player_id, req.user.id, learning_style||null, communication_style||null,
      personality_type||null, emotional_regulation||null,
      JSON.stringify(fear_response_patterns||[]), JSON.stringify(confidence_triggers||[]),
      JSON.stringify(stress_indicators||[]), JSON.stringify(regulation_strategies||[]),
      parent_involvement_level||null, parent_coaching_notes||null, parent_protocol_active||false
    ]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save behavioural profile' });
  }
});

// POST /behavioural/communication-audit — F1-style session debrief
behaviouralRouter.post('/communication-audit', authenticate, async (req, res) => {
  const { session_id, player_id, audit_notes } = req.body;
  try {
    const prompt = `Analyse this tennis coaching communication audit for a session:

Notes from coach: ${audit_notes}

Using TennisNLP™ frameworks, identify:
1. Language patterns used (positive/growth vs fear/pressure)
2. Communication strengths this session
3. One specific language improvement for next session
4. Fear language count (approx)
5. Growth language count (approx)
6. Session communication score out of 10

Return JSON: {"language_patterns": [...], "positive_moments": [...], "development_areas": [...], "fear_language_count": N, "growth_language_count": N, "ai_analysis": "...", "score": N.N}`;

    const aiResult = await aiService.queryAI(req.user.id, prompt, { type: 'communication_audit' });
    let auditData;
    try {
      auditData = JSON.parse(aiResult.response.replace(/```json|```/g, '').trim());
    } catch {
      auditData = { ai_analysis: aiResult.response, score: 7 };
    }

    const result = await query(`
      INSERT INTO communication_audits (
        coach_id, session_id, player_id, language_patterns, positive_moments,
        development_areas, fear_language_count, growth_language_count, ai_analysis, score
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [
      req.user.id, session_id||null, player_id||null,
      JSON.stringify(auditData.language_patterns||[]),
      auditData.positive_moments||[],
      auditData.development_areas||[],
      auditData.fear_language_count||0,
      auditData.growth_language_count||0,
      auditData.ai_analysis||'',
      auditData.score||0
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Audit failed' });
  }
});

// ─── DRILL LIBRARY ROUTER ─────────────────────────────────────────────────────
const drillsRouter = express.Router();

drillsRouter.get('/', authenticate, async (req, res) => {
  const { drill_type, skill_focus, age_group, environment_type, search, limit = 20, offset = 0 } = req.query;
  try {
    let sql = 'SELECT * FROM drill_library WHERE true';
    const params = [];
    let idx = 1;
    if (drill_type) { sql += ` AND drill_type = $${idx++}`; params.push(drill_type); }
    if (age_group) { sql += ` AND player_age_group = $${idx++}`; params.push(age_group); }
    if (environment_type) { sql += ` AND $${idx++} = ANY(environment_types::text[])`; params.push(environment_type); }
    if (skill_focus) { sql += ` AND $${idx++} = ANY(skill_focus)`; params.push(skill_focus); }
    if (search) {
      sql += ` AND to_tsvector('english', name || ' ' || coalesce(description,'')) @@ plainto_tsquery('english', $${idx++})`;
      params.push(search);
    }
    sql += ` ORDER BY name LIMIT $${idx} OFFSET $${idx+1}`;
    params.push(parseInt(limit), parseInt(offset));
    const result = await query(sql, params);
    res.json({ drills: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch drills' });
  }
});

drillsRouter.post('/', authenticate, async (req, res) => {
  const {
    name, description, drill_type, skill_focus, player_age_group, player_level,
    min_players, max_players, court_space_required, equipment_required,
    duration_minutes, environment_types, coaching_cues, progressions,
    regressions, framework_refs, is_proprietary
  } = req.body;
  try {
    const result = await query(`
      INSERT INTO drill_library (
        name, description, drill_type, skill_focus, player_age_group, player_level,
        min_players, max_players, court_space_required, equipment_required,
        duration_minutes, environment_types, coaching_cues, progressions,
        regressions, framework_refs, is_proprietary, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
    `, [
      name, description||null, drill_type||null,
      skill_focus ? `{${skill_focus.map(s=>`"${s}"`).join(',')}}` : null,
      player_age_group||null, player_level||null,
      min_players||1, max_players||null, court_space_required||null,
      equipment_required ? `{${equipment_required.map(e=>`"${e}"`).join(',')}}` : null,
      duration_minutes||null,
      environment_types ? `{${environment_types}}` : null,
      JSON.stringify(coaching_cues||[]), JSON.stringify(progressions||[]),
      JSON.stringify(regressions||[]),
      framework_refs ? `{${framework_refs.map(f=>`"${f}"`).join(',')}}` : null,
      is_proprietary||false, req.user.id
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create drill' });
  }
});

// AI Drill Generator
drillsRouter.post('/generate', authenticate, async (req, res) => {
  const { skill_focus, player_level, environment_type, duration_minutes, constraints } = req.body;
  try {
    const prompt = `Generate a game-based tennis drill using modern learning principles:

Requirements:
- Skill focus: ${(skill_focus||[]).join(', ')}
- Player level: ${player_level}
- Environment: ${environment_type}
- Duration: ${duration_minutes || 15} minutes
- Constraints/notes: ${constraints || 'none'}

Use constraint-based coaching and decision-making principles. The drill should NOT be a feeding drill.
It must involve decision-making under game-realistic conditions.

Return JSON: {"name": "...", "description": "...", "setup": "...", "how_to_play": "...", "coaching_cues": ["..."], "progressions": ["..."], "regressions": ["..."]}`;

    const result = await aiService.queryAI(req.user.id, prompt, { type: 'drill_generation' });
    let drill;
    try {
      drill = JSON.parse(result.response.replace(/```json|```/g, '').trim());
    } catch {
      drill = { name: 'AI Generated Drill', description: result.response };
    }
    res.json({ drill });
  } catch (err) {
    res.status(500).json({ error: 'Drill generation failed' });
  }
});

// ─── LEARNING PROGRESS ROUTER ─────────────────────────────────────────────────
const learningRouter = express.Router();

learningRouter.get('/:user_id', authenticate, async (req, res) => {
  try {
    const [progress, habits, achievements] = await Promise.all([
      query('SELECT * FROM learning_progress WHERE user_id = $1 ORDER BY last_activity DESC', [req.params.user_id]),
      query('SELECT * FROM daily_coaching_habits WHERE coach_id = $1 AND habit_date >= NOW() - INTERVAL \'7 days\' ORDER BY habit_date DESC', [req.params.user_id]),
      query('SELECT * FROM achievements WHERE user_id = $1 ORDER BY earned_at DESC', [req.params.user_id]),
    ]);
    res.json({
      modules: progress.rows,
      recentHabits: habits.rows,
      achievements: achievements.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch learning progress' });
  }
});

learningRouter.post('/habits/complete', authenticate, async (req, res) => {
  const { habit_type, title, content } = req.body;
  try {
    // Get current streak
    const streakResult = await query(`
      SELECT COUNT(*) as streak FROM daily_coaching_habits
      WHERE coach_id = $1 AND completed = true
        AND habit_date >= CURRENT_DATE - INTERVAL '7 days'
    `, [req.user.id]);
    const streak = parseInt(streakResult.rows[0].streak) + 1;

    const result = await query(`
      INSERT INTO daily_coaching_habits (coach_id, habit_type, title, content, completed, completed_at, streak_count, xp_earned)
      VALUES ($1, $2, $3, $4, true, NOW(), $5, 10)
      ON CONFLICT (coach_id, habit_date, habit_type) DO UPDATE SET
        completed = true, completed_at = NOW(), streak_count = $5
      RETURNING *
    `, [req.user.id, habit_type, title||null, content||null, streak]);

    // Check streak achievements
    if (streak >= 7) {
      await query(`
        INSERT INTO achievements (user_id, badge_id, badge_name, badge_category)
        VALUES ($1, 'reflection_7_day', '7-Day Reflection Streak', 'streak')
        ON CONFLICT DO NOTHING
      `, [req.user.id]);
    }

    res.json({ habit: result.rows[0], streak, xpEarned: 10 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record habit' });
  }
});

// ─── BUSINESS OS ROUTER ───────────────────────────────────────────────────────
const businessOsRouter = express.Router();

// GET /business-os/pricing-calculator
businessOsRouter.get('/pricing-calculator/:coach_id', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM pricing_models WHERE coach_id = $1 AND is_active = true', [req.params.coach_id]);
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pricing model' });
  }
});

// POST /business-os/pricing-calculator
businessOsRouter.post('/pricing-calculator', authenticate, async (req, res) => {
  const { hourly_rate, court_hire_cost, insurance_annual, travel_cost_per_mile, target_monthly_revenue, working_hours_per_week } = req.body;
  try {
    // Calculate breakeven
    const weeklyFixedCosts = (parseFloat(insurance_annual||0) / 52) + parseFloat(court_hire_cost||0);
    const monthlyFixedCosts = weeklyFixedCosts * 4.33;
    const breakevenSessions = Math.ceil(monthlyFixedCosts / parseFloat(hourly_rate||60));

    const result = await query(`
      INSERT INTO pricing_models (coach_id, hourly_rate, court_hire_cost, insurance_annual, travel_cost_per_mile, target_monthly_revenue, breakeven_sessions)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT DO NOTHING
      RETURNING *
    `, [req.user.id, hourly_rate||null, court_hire_cost||null, insurance_annual||null, travel_cost_per_mile||null, target_monthly_revenue||null, breakevenSessions]);

    const aiPrompt = `A tennis coach has the following pricing structure:
Hourly rate: £${hourly_rate}, Monthly target: £${target_monthly_revenue}, Breakeven sessions: ${breakevenSessions}
UK market context: premium coaching £80-120/hr, mid-market £50-75/hr, school/group £30-50/hr.
Give 2 sentences: one pricing validation and one improvement suggestion.`;

    const aiInsight = await aiService.queryAI(req.user.id, aiPrompt, { type: 'pricing' });

    res.json({
      model: result.rows[0],
      breakeven: { sessions: breakevenSessions, monthlyFixedCosts: monthlyFixedCosts.toFixed(2) },
      aiInsight: aiInsight.response
    });
  } catch (err) {
    res.status(500).json({ error: 'Pricing calculation failed' });
  }
});

// GET /business-os/programme-templates
businessOsRouter.get('/programme-templates', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM programme_templates WHERE (coach_id = $1 OR is_template = true) AND is_published = true ORDER BY programme_type',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// POST /business-os/programme-templates/generate
businessOsRouter.post('/programme-templates/generate', authenticate, async (req, res) => {
  const { programme_type, duration_weeks, target_audience, price } = req.body;
  try {
    const prompt = `Design a ${duration_weeks || 6}-week tennis programme template:
Type: ${programme_type}
Target audience: ${target_audience}
Price: £${price || 'TBD'}

Create a structured curriculum with weekly themes and session objectives.
Return JSON: {"name": "...", "description": "...", "curriculum": [{"week": 1, "theme": "...", "objectives": ["...", "..."]}, ...], "marketing_points": ["..."]}`;

    const result = await aiService.queryAI(req.user.id, prompt, { type: 'programme_design' });
    let programme;
    try { programme = JSON.parse(result.response.replace(/```json|```/g, '').trim()); }
    catch { programme = { name: 'Programme', description: result.response }; }
    res.json({ programme });
  } catch (err) {
    res.status(500).json({ error: 'Programme generation failed' });
  }
});

// ─── COMMUNITY ROUTER ─────────────────────────────────────────────────────────
const communityNetworkRouter = express.Router();

communityNetworkRouter.get('/groups', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT cg.*, COUNT(cm.user_id) as member_count,
        CASE WHEN EXISTS(SELECT 1 FROM community_memberships WHERE user_id = $1 AND group_id = cg.id) THEN true ELSE false END as is_member
      FROM community_groups cg
      LEFT JOIN community_memberships cm ON cm.group_id = cg.id
      WHERE cg.is_public = true
      GROUP BY cg.id ORDER BY cg.name
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

communityNetworkRouter.post('/groups/:id/join', authenticate, async (req, res) => {
  try {
    await query(
      'INSERT INTO community_memberships (user_id, group_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.user.id, req.params.id]
    );
    res.json({ message: 'Joined group' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to join group' });
  }
});

communityNetworkRouter.get('/mentorships', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT m.*, mentor.name as mentor_name, mentee.name as mentee_name
      FROM mentorships m
      JOIN users mentor ON mentor.id = m.mentor_id
      JOIN users mentee ON mentee.id = m.mentee_id
      WHERE m.mentor_id = $1 OR m.mentee_id = $1
      ORDER BY m.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch mentorships' });
  }
});

// ─── PREDICTIVE INSIGHTS ROUTER ───────────────────────────────────────────────
const predictiveRouter = express.Router();

predictiveRouter.post('/generate/:coach_id', authenticate, async (req, res) => {
  try {
    const [players, metrics] = await Promise.all([
      query(`SELECT * FROM players WHERE coach_id = $1 AND is_active = true`, [req.params.coach_id]),
      query(`SELECT * FROM business_metrics WHERE coach_id = $1 ORDER BY period_start DESC LIMIT 3`, [req.params.coach_id]),
    ]);

    const atRisk = players.rows.filter(p => p.dropout_risk_level === 'high' || p.dropout_risk_level === 'critical');

    const prompt = `Generate retention and revenue predictions for a tennis coach:

Current Players: ${players.rows.length} active
At-Risk Players: ${atRisk.length} (${atRisk.map(p=>p.name).join(', ')})
Recent Revenue: ${metrics.rows.map(m=>`£${m.revenue} (${m.period_start})`).join(', ')}

Predict for the next 90 days:
1. Player retention forecast (% likely to remain)
2. Revenue forecast
3. Top 1 action to improve outcomes

Return JSON: {"retention_forecast": "X%", "revenue_forecast": "£X-Y", "confidence": 0.X, "top_action": "...", "reasoning": "..."}`;

    const result = await aiService.queryAI(req.user.id, prompt, { type: 'prediction' });
    let prediction;
    try { prediction = JSON.parse(result.response.replace(/```json|```/g, '').trim()); }
    catch { prediction = { reasoning: result.response }; }

    await query(`
      INSERT INTO predictive_insights (coach_id, insight_type, prediction, confidence_score, data_snapshot, valid_until)
      VALUES ($1, 'retention_revenue_forecast', $2, $3, $4, CURRENT_DATE + 90)
    `, [req.params.coach_id, JSON.stringify(prediction), prediction.confidence||0.7, JSON.stringify({ players: players.rows.length, at_risk: atRisk.length })]);

    res.json({ prediction });
  } catch (err) {
    res.status(500).json({ error: 'Prediction generation failed' });
  }
});

module.exports = {
  identityRouter,
  behaviouralRouter,
  drillsRouter,
  learningRouter,
  businessOsRouter,
  communityNetworkRouter,
  predictiveRouter,
};
