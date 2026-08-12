// ============================================================
// CG Tennis OS™ — TOURNAMENT MATCH SERVICE
// Data layer for tournamentMatches.js routes — the genuine live engine.
// © CG Tennis Academies. All Rights Reserved.
// ============================================================
//
// Every write in this file logs to tournament_match_history BEFORE
// updating the match row, per the architecture note in
// migrate_tournament_engine.sql section 4.

const { query, pool } = require('../config/database');
const { roundLabel } = require('./tournamentDrawService');

const MATCH_SELECT = `
  m.id, m.draw_id, m.event_id, m.round_number, m.round_label, m.group_label,
  m.player1_id, m.player1_partner_id, m.player2_id, m.player2_partner_id,
  m.court_id, m.court_name AS court_label, m.scheduled_time, m.actual_start_time, m.actual_end_time,
  m.status, m.score, m.winner_id, m.retirement_reason,
  m.is_featured, m.has_highlights, m.stream_url, m.vod_url,
  m.last_updated_by, m.created_at, m.updated_at,
  p1.name AS player1_name, p2.name AS player2_name
`;

const MATCH_JOIN = `
  FROM tournament_matches m
  LEFT JOIN players p1 ON p1.id = m.player1_id
  LEFT JOIN players p2 ON p2.id = m.player2_id
`;

// Flattens the JSONB score array (e.g. [{"set":1,"player1":6,"player2":4}])
// into the simple score_p1 / score_p2 display strings the frontend
// MatchCard component expects (e.g. "6-4, 3-6, 7-5").
function formatScore(score) {
  if (!Array.isArray(score) || score.length === 0) return { score_p1: null, score_p2: null };
  // Standard tennis notation: dash within a set score is implied by the
  // two numbers side by side; comma separates sets — e.g. "6, 6" reads
  // ambiguously as a single tied set, so sets are comma-separated and
  // each set's pairing is shown as "p1-p2" per set for the detail view,
  // while the compact card view uses the simple per-set number lists.
  const p1 = score.map(s => s.player1).join(', ');
  const p2 = score.map(s => s.player2).join(', ');
  return { score_p1: p1, score_p2: p2 };
}

function withFormattedScore(row) {
  if (!row) return row;
  return { ...row, ...formatScore(row.score) };
}

// ─── Literal-path reads ──────────────────────────────────────────────────────────

async function getOrderOfPlay(eventId, date) {
  const conditions = ['m.event_id = $1'];
  const params = [eventId];
  if (date) {
    conditions.push(`m.scheduled_time::date = $2`);
    params.push(date);
  }
  const result = await query(`
    SELECT ${MATCH_SELECT} ${MATCH_JOIN}
    WHERE ${conditions.join(' AND ')}
    ORDER BY m.scheduled_time ASC NULLS LAST, m.round_number ASC
  `, params);
  return result.rows.map(withFormattedScore);
}

async function getLiveMatches(eventId) {
  const result = await query(`
    SELECT ${MATCH_SELECT} ${MATCH_JOIN}
    WHERE m.event_id = $1 AND m.status IN ('live', 'suspended')
    ORDER BY m.court_name ASC NULLS LAST
  `, [eventId]);
  return result.rows.map(withFormattedScore);
}

async function getResults(eventId, round) {
  const conditions = ['m.event_id = $1', `m.status IN ('completed','retired','walkover')`];
  const params = [eventId];
  if (round) {
    conditions.push(`m.round_number = $2`);
    params.push(round);
  }
  const result = await query(`
    SELECT ${MATCH_SELECT} ${MATCH_JOIN}
    WHERE ${conditions.join(' AND ')}
    ORDER BY m.actual_end_time DESC NULLS LAST
  `, params);
  return result.rows.map(withFormattedScore);
}

async function getPlayerMatchHistory(playerId, limit = 20) {
  const result = await query(`
    SELECT ${MATCH_SELECT} ${MATCH_JOIN}
    WHERE (m.player1_id = $1 OR m.player2_id = $1)
      AND m.status IN ('completed','retired','walkover')
    ORDER BY m.actual_end_time DESC NULLS LAST
    LIMIT $2
  `, [playerId, limit]);
  return result.rows.map(withFormattedScore);
}

async function getMatchHistory(matchId) {
  const result = await query(`
    SELECT h.*, u.name AS changed_by_name
    FROM tournament_match_history h
    LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.match_id = $1
    ORDER BY h.changed_at DESC
  `, [matchId]);
  return result.rows;
}

async function getMatch(id) {
  const result = await query(`SELECT ${MATCH_SELECT} ${MATCH_JOIN} WHERE m.id = $1`, [id]);
  if (!result.rows[0]) throw new Error('Match not found');
  return withFormattedScore(result.rows[0]);
}

// ─── Shared history-logging helper ───────────────────────────────────────────────

async function logHistory(client, matchId, userId, changeType, previousValue, newValue) {
  await client.query(`
    INSERT INTO tournament_match_history (match_id, changed_by, change_type, previous_value, new_value)
    VALUES ($1,$2,$3,$4,$5)
  `, [matchId, userId || null, changeType, JSON.stringify(previousValue), JSON.stringify(newValue)]);
}

// ─── Writes ───────────────────────────────────────────────────────────────────────

async function updateSchedule(id, body, userId) {
  const { scheduledTime, courtName, courtId } = body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT scheduled_time, court_name, court_id FROM tournament_matches WHERE id = $1 FOR UPDATE', [id]);
    if (!before.rows[0]) throw new Error('Match not found');

    const result = await client.query(`
      UPDATE tournament_matches
      SET scheduled_time = COALESCE($1, scheduled_time),
          court_name = COALESCE($2, court_name),
          court_id = COALESCE($3, court_id),
          last_updated_by = $4,
          updated_at = NOW()
      WHERE id = $5
      RETURNING ${MATCH_SELECT.replace(/m\./g, '')}
    `, [scheduledTime || null, courtName || null, courtId || null, userId, id]);

    await logHistory(client, id, userId, 'time_change', before.rows[0], { scheduledTime, courtName, courtId });
    await client.query('COMMIT');

    // Re-fetch with player name joins for a consistent response shape
    return await getMatch(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function setMatchStatus(id, status, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT status, actual_start_time FROM tournament_matches WHERE id = $1 FOR UPDATE', [id]);
    if (!before.rows[0]) throw new Error('Match not found');

    const setActualStart = status === 'live' && !before.rows[0].actual_start_time;

    await client.query(`
      UPDATE tournament_matches
      SET status = $1,
          actual_start_time = CASE WHEN $2 THEN NOW() ELSE actual_start_time END,
          last_updated_by = $3,
          updated_at = NOW()
      WHERE id = $4
    `, [status, setActualStart, userId, id]);

    await logHistory(client, id, userId, 'status_change', { status: before.rows[0].status }, { status });
    await client.query('COMMIT');

    return await getMatch(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// The core secure score-entry flow. Records the result, marks the
// winner, and — for knockout draws — advances the winner into the next
// round's match, creating that match if it doesn't exist yet.
async function recordResult(id, body, userId) {
  const { score = [], status = 'completed', winnerId, retirementReason } = body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const beforeResult = await client.query(`
      SELECT * FROM tournament_matches WHERE id = $1 FOR UPDATE
    `, [id]);
    const before = beforeResult.rows[0];
    if (!before) throw new Error('Match not found');

    const resolvedWinnerId = winnerId
      || (status === 'walkover' ? (before.player1_id || before.player2_id) : null);

    await client.query(`
      UPDATE tournament_matches
      SET status = $1, score = $2, winner_id = $3, retirement_reason = $4,
          actual_end_time = NOW(), last_updated_by = $5, updated_at = NOW()
      WHERE id = $6
    `, [status, JSON.stringify(score), resolvedWinnerId, retirementReason || null, userId, id]);

    await logHistory(client, id, userId, 'score_update',
      { status: before.status, score: before.score, winner_id: before.winner_id },
      { status, score, winner_id: resolvedWinnerId });

    // Mark the loser eliminated in the draw, if this is a knockout draw
    // and we have a resolved winner.
    let advancement = null;
    if (resolvedWinnerId && before.draw_id) {
      const loserId = resolvedWinnerId === before.player1_id ? before.player2_id : before.player1_id;
      if (loserId) {
        await client.query(`
          UPDATE tournament_draw_positions
          SET eliminated_at_round = $1
          WHERE draw_id = $2 AND player_id = $3
        `, [before.round_number, before.draw_id, loserId]);
      }

      advancement = await advanceWinner(client, before, resolvedWinnerId, userId);
    }

    await client.query('COMMIT');

    return { match: await getMatch(id), advancement };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Places the winner into the next round's match. bracket_slot (assigned
// at creation time — see migrate_tournament_engine_bracket_slot.sql)
// tells us exactly where this match sits within its round, so the next
// match's slot and this match's "first or second player" role are both
// computed directly from that number — no guessing from row order.
async function advanceWinner(client, completedMatch, winnerId, userId) {
  const drawResult = await client.query('SELECT bracket_size FROM tournament_draws WHERE id = $1', [completedMatch.draw_id]);
  const draw = drawResult.rows[0];
  if (!draw) return null;

  const totalRounds = Math.log2(draw.bracket_size);
  const nextRoundNumber = completedMatch.round_number + 1;
  if (nextRoundNumber > totalRounds) {
    // This was the final — no advancement, just a tournament winner
    return { finalWinner: winnerId };
  }

  const currentSlot = completedMatch.bracket_slot;
  if (currentSlot == null) {
    // Defensive fallback for any match created before this column existed
    // — should not happen for matches created via generateBracket/
    // advanceWinner going forward, but fails loudly rather than silently
    // misrouting a winner if it ever does.
    throw new Error(`Match ${completedMatch.id} has no bracket_slot — cannot determine advancement path`);
  }

  const nextSlot = Math.floor(currentSlot / 2);
  const isFirstSlot = currentSlot % 2 === 0;

  const existingResult = await client.query(`
    SELECT id FROM tournament_matches
    WHERE draw_id = $1 AND round_number = $2 AND bracket_slot = $3
  `, [completedMatch.draw_id, nextRoundNumber, nextSlot]);

  let nextMatchId = existingResult.rows[0]?.id;

  if (!nextMatchId) {
    const created = await client.query(`
      INSERT INTO tournament_matches (draw_id, event_id, round_number, round_label, bracket_slot, player1_id, status)
      VALUES ($1,$2,$3,$4,$5,$6,'scheduled')
      RETURNING id
    `, [
      completedMatch.draw_id, completedMatch.event_id, nextRoundNumber,
      roundLabel(draw.bracket_size, nextRoundNumber), nextSlot,
      isFirstSlot ? winnerId : null,
    ]);
    nextMatchId = created.rows[0].id;
    if (!isFirstSlot) {
      await client.query('UPDATE tournament_matches SET player2_id = $1 WHERE id = $2', [winnerId, nextMatchId]);
    }
  } else {
    const column = isFirstSlot ? 'player1_id' : 'player2_id';
    await client.query(`UPDATE tournament_matches SET ${column} = $1, updated_at = NOW() WHERE id = $2`, [winnerId, nextMatchId]);
  }

  await client.query(`
    UPDATE tournament_draws SET current_round = $1, updated_at = NOW()
    WHERE id = $2 AND current_round < $1
  `, [nextRoundNumber, completedMatch.draw_id]);

  return { nextMatchId, nextRoundNumber };
}

async function setFeaturedMatch(id, isFeatured, userId) {
  const result = await query(`
    UPDATE tournament_matches
    SET is_featured = $1, last_updated_by = $2, updated_at = NOW()
    WHERE id = $3
    RETURNING id
  `, [isFeatured, userId, id]);
  if (!result.rows[0]) throw new Error('Match not found');
  return await getMatch(id);
}

async function setStreamLinks(id, body, userId) {
  const { streamUrl, vodUrl, hasHighlights } = body;
  const result = await query(`
    UPDATE tournament_matches
    SET stream_url = COALESCE($1, stream_url),
        vod_url = COALESCE($2, vod_url),
        has_highlights = COALESCE($3, has_highlights),
        last_updated_by = $4,
        updated_at = NOW()
    WHERE id = $5
    RETURNING id
  `, [streamUrl || null, vodUrl || null, hasHighlights ?? null, userId, id]);
  if (!result.rows[0]) throw new Error('Match not found');
  return await getMatch(id);
}

module.exports = {
  getOrderOfPlay,
  getLiveMatches,
  getResults,
  getPlayerMatchHistory,
  getMatchHistory,
  getMatch,
  updateSchedule,
  setMatchStatus,
  recordResult,
  setFeaturedMatch,
  setStreamLinks,
};
