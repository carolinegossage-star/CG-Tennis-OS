// ============================================================
// CG Tennis OS™ — TOUR CURATION SERVICE
// "Apex Tour Intelligence™" — the moat: AI drafts, Caroline reviews
// © CG Tennis Academies. All Rights Reserved.
// ============================================================

const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Draft Daily Curation Notes for Top Events ───────────────────────────────
// Selects the most coaching-relevant events of the week and drafts AI commentary
// for Caroline to review before publishing.

async function draftDailyNotes(maxNotes = 10) {
  logger.info('Drafting daily tour curation notes...');

  try {
    // Pull candidate events: live now, or starting in the next 3 days, prioritising
    // Challengers and ITFs (where the "why it matters" layer adds the most value —
    // Grand Slams already get plenty of mainstream coverage)
    const candidates = await query(`
      SELECT te.*,
        (SELECT json_agg(tm.*) FROM tour_matches tm WHERE tm.event_id = te.id AND tm.status IN ('live','scheduled') LIMIT 5) as sample_matches
      FROM tour_events te
      WHERE te.end_date >= CURRENT_DATE
        AND te.start_date <= CURRENT_DATE + INTERVAL '3 days'
        AND NOT EXISTS (
          SELECT 1 FROM tour_curation_notes tcn
          WHERE tcn.event_id = te.id AND tcn.note_date = CURRENT_DATE
        )
      ORDER BY
        CASE te.tier
          WHEN 'challenger_125' THEN 1 WHEN 'challenger_100' THEN 1
          WHEN 'challenger_75' THEN 2 WHEN 'challenger_50' THEN 2
          WHEN 'itf_w100' THEN 3 WHEN 'itf_w75' THEN 3
          ELSE 4
        END,
        te.is_live_now DESC
      LIMIT $1
    `, [maxNotes]);

    const drafted = [];

    for (const event of candidates.rows) {
      const note = await draftSingleNote(event);
      if (note) drafted.push(note);
    }

    logger.info(`Drafted ${drafted.length} curation notes for review`);
    return drafted;
  } catch (err) {
    logger.error('Daily note drafting failed', { error: err.message });
    throw err;
  }
}

// ─── Draft a Single Curation Note ─────────────────────────────────────────────
async function draftSingleNote(event) {
  const matchesSummary = (event.sample_matches || [])
    .slice(0, 5)
    .map(m => `${m.player_a_name} (#${m.player_a_rank || 'unranked'}) vs ${m.player_b_name} (#${m.player_b_rank || 'unranked'})`)
    .join('; ');

  const prompt = `You write short, sharp "why this matters" notes for coaches and tennis parents about lower-tier professional tournaments (Challengers, ITFs) that mainstream tennis media ignores.

Your audience already knows the scores — TNNS, FlashScore, etc. give them that. Your job is to explain WHY a specific tournament or matchup is worth a coach's attention this week: surface development patterns, comeback trails, qualifier-to-main-draw stories, style matchups, junior transition pathways, or academy pipeline signals.

Tournament: ${event.name}
Tier: ${event.tier}
Surface: ${event.surface_type || 'unknown'}
Location: ${event.location_city}, ${event.location_country}
Dates: ${event.start_date} to ${event.end_date}
Sample matches this round: ${matchesSummary || 'draw not yet available'}

Write:
1. A short headline (under 12 words)
2. A 3-5 sentence "why it matters" note in a knowledgeable, slightly insider tone — as if written by a senior coach to other coaches. Reference specific, plausible coaching angles (surface transition, return patterns, qualifier resilience, etc.) Do NOT invent specific player statistics you cannot know — speak in terms of patterns and context, not fabricated numbers.
3. 1-3 relevance tags from this list only: surface_development, nextgen_watch, return_patterns, comeback_trail, qualifier_to_main_draw, academy_pipeline, style_matchup, injury_return, junior_transition, wildcard_story, travel_load_case_study

Return JSON only: {"headline": "...", "commentary": "...", "relevance_tags": ["tag1","tag2"]}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0]?.text || '';
    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      logger.warn('Curation note AI response not valid JSON, skipping', { eventId: event.id });
      return null;
    }

    const result = await query(`
      INSERT INTO tour_curation_notes (
        event_id, headline, commentary, relevance_tags,
        ai_drafted, ai_draft_text, review_status, is_published
      ) VALUES ($1, $2, $3, $4, true, $3, 'pending_review', false)
      RETURNING *
    `, [
      event.id, parsed.headline, parsed.commentary,
      parsed.relevance_tags || [],
    ]);

    return result.rows[0];
  } catch (err) {
    logger.warn('Single note drafting failed', { eventId: event.id, error: err.message });
    return null;
  }
}

// ─── Caroline's Review Queue ──────────────────────────────────────────────────
async function getReviewQueue() {
  const result = await query(`
    SELECT tcn.*, te.name as event_name, te.tier, te.surface_type, te.location_city, te.location_country
    FROM tour_curation_notes tcn
    LEFT JOIN tour_events te ON te.id = tcn.event_id
    WHERE tcn.review_status = 'pending_review'
    ORDER BY tcn.created_at ASC
  `);
  return result.rows;
}

// ─── Approve / Edit / Reject a Note ───────────────────────────────────────────
async function reviewNote(noteId, reviewerId, decision, editedCommentary, editedHeadline) {
  const statusMap = { approve: 'approved', edit: 'edited', reject: 'rejected' };
  const status = statusMap[decision];
  if (!status) throw new Error('Invalid review decision');

  const shouldPublish = status === 'approved' || status === 'edited';

  const result = await query(`
    UPDATE tour_curation_notes SET
      review_status = $1,
      reviewed_by = $2,
      reviewed_at = NOW(),
      commentary = COALESCE($3, commentary),
      headline = COALESCE($4, headline),
      is_published = $5,
      published_at = CASE WHEN $5 THEN NOW() ELSE NULL END
    WHERE id = $6
    RETURNING *
  `, [status, reviewerId, editedCommentary || null, editedHeadline || null, shouldPublish, noteId]);

  return result.rows[0];
}

// ─── Public Feed (free layer — what visitors actually see) ───────────────────
async function getPublishedFeed(limit = 20) {
  const result = await query(`
    SELECT tcn.id, tcn.headline, tcn.commentary, tcn.relevance_tags, tcn.published_at,
      te.name as event_name, te.tier, te.surface_type,
      te.location_city, te.location_country, te.start_date, te.end_date,
      te.is_live_now, te.active_match_count
    FROM tour_curation_notes tcn
    JOIN tour_events te ON te.id = tcn.event_id
    WHERE tcn.is_published = true
    ORDER BY te.is_live_now DESC, tcn.published_at DESC
    LIMIT $1
  `, [limit]);
  return result.rows;
}

// ─── Track Engagement (view/share — informs what resonates) ──────────────────
async function trackView(noteId) {
  await query('UPDATE tour_curation_notes SET view_count = view_count + 1 WHERE id = $1', [noteId]);
}

async function trackShare(noteId) {
  await query('UPDATE tour_curation_notes SET share_count = share_count + 1 WHERE id = $1', [noteId]);
}

module.exports = {
  draftDailyNotes,
  draftSingleNote,
  getReviewQueue,
  reviewNote,
  getPublishedFeed,
  trackView,
  trackShare,
};
