// ============================================================
// CG Tennis OS™ — TOURNAMENT DRAW SERVICE
// Data layer for tournamentDraws.js routes.
// © CG Tennis Academies. All Rights Reserved.
// ============================================================

const { query, pool } = require('../config/database');

// ─── Reads ──────────────────────────────────────────────────────────────────────

async function getDrawWithPositions(id) {
  const drawResult = await query('SELECT * FROM tournament_draws WHERE id = $1', [id]);
  const draw = drawResult.rows[0];
  if (!draw) throw new Error('Draw not found');

  const positionsResult = await query(`
    SELECT
      dp.*,
      p.name AS player_name, p.ranking_current
    FROM tournament_draw_positions dp
    JOIN players p ON p.id = dp.player_id
    WHERE dp.draw_id = $1
    ORDER BY dp.draw_position ASC
  `, [id]);

  return { ...draw, positions: positionsResult.rows };
}

// ─── Create (config only — no bracket yet) ─────────────────────────────────────

async function createDraw(eventId, config, userId) {
  const {
    bracketType = 'knockout', bracketSize, groupCount, winnersPerGroup,
    seedCount = 0, seedingMethod = 'ranking',
    hasConsolation = false, hasThirdPlaceMatch = false, hasGrandFinalReset = false,
    manualStart = false, bracketVisibility = 'hidden',
  } = config;

  if (!bracketSize || bracketSize < 2) {
    throw new Error('bracketSize must be at least 2');
  }

  const result = await query(`
    INSERT INTO tournament_draws (
      event_id, bracket_type, bracket_size, group_count, winners_per_group,
      seed_count, seeding_method,
      has_consolation, has_third_place_match, has_grand_final_reset,
      manual_start, bracket_visibility
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *
  `, [
    eventId, bracketType, bracketSize, groupCount || null, winnersPerGroup || null,
    seedCount, seedingMethod,
    hasConsolation, hasThirdPlaceMatch, hasGrandFinalReset,
    manualStart, bracketVisibility,
  ]);

  return result.rows[0];
}

// ─── Generate — the actual bracket build ────────────────────────────────────────
// Standard single-elimination seeding: entrants are placed so that, if
// seeds hold, seed 1 and seed 2 can only meet in the final, seeds 1-4
// can only meet from the semis onward, and so on. Unseeded entrants fill
// the remaining slots in random order. Byes (when entryIds.length isn't
// a power of two matching bracketSize) are given to the top seeds first,
// which is the standard tennis-draw convention.

function nextPowerOfTwo(n) {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

// Classic recursive bracket-slot ordering (the same pattern used to seed
// real single-elimination draws) — returns an array of length `size`
// where slotOrder[i] = the seed number that belongs in bracket slot i.
function standardSeedSlots(size) {
  if (size === 1) return [1];
  const prev = standardSeedSlots(size / 2);
  const out = new Array(size);
  for (let i = 0; i < prev.length; i++) {
    out[i * 2] = prev[i];
    out[i * 2 + 1] = size + 1 - prev[i];
  }
  return out;
}

async function generateBracket(drawId, entryIds, seedAssignments = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const drawResult = await client.query('SELECT * FROM tournament_draws WHERE id = $1 FOR UPDATE', [drawId]);
    const draw = drawResult.rows[0];
    if (!draw) throw new Error('Draw not found');
    if (draw.locked) throw new Error('This draw is locked and cannot be regenerated — results have already been recorded against it');

    // Resolve entries -> player_ids, keep entry_id for draw_positions FK
    const entriesResult = await client.query(`
      SELECT id AS entry_id, player_id
      FROM tournament_entries
      WHERE id = ANY($1::uuid[])
    `, [entryIds]);
    const entries = entriesResult.rows;
    if (entries.length !== entryIds.length) {
      throw new Error('One or more entryIds could not be resolved to a valid tournament entry');
    }

    const bracketSize = nextPowerOfTwo(entries.length);
    const slotSeeds = standardSeedSlots(bracketSize); // slotSeeds[slotIndex] = seed number (1-based)

    // Split entries into seeded (per seedAssignments: {entryId: seedNumber}) and unseeded
    const seeded = [];
    const unseeded = [];
    for (const e of entries) {
      const seed = seedAssignments[e.entry_id];
      if (seed) seeded.push({ ...e, seed });
      else unseeded.push(e);
    }
    seeded.sort((a, b) => a.seed - b.seed);

    // Shuffle unseeded entries (Fisher-Yates) so byes/pairings aren't
    // predictable — standard practice, avoids any appearance of favouritism.
    for (let i = unseeded.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unseeded[i], unseeded[j]] = [unseeded[j], unseeded[i]];
    }

    // Place seeded entries into their designated slots; fill remaining
    // slots with unseeded entries in shuffled order; leftover slots are
    // byes (left empty — player_id null, treated as an automatic walkover
    // in round 1 by the match layer).
    const slotAssignment = new Array(bracketSize).fill(null);
    for (const s of seeded) {
      const slotIndex = slotSeeds.findIndex((seedNum, idx) => seedNum === s.seed && slotAssignment[idx] === null);
      if (slotIndex !== -1) slotAssignment[slotIndex] = s;
    }
    let unseededPointer = 0;
    for (let i = 0; i < bracketSize; i++) {
      if (slotAssignment[i] === null && unseededPointer < unseeded.length) {
        slotAssignment[i] = unseeded[unseededPointer++];
      }
    }

    // Clear any previous positions for this draw (regeneration case —
    // only reachable if not locked, per the check above)
    await client.query('DELETE FROM tournament_draw_positions WHERE draw_id = $1', [drawId]);

    const insertedPositions = [];
    for (let i = 0; i < bracketSize; i++) {
      const entry = slotAssignment[i];
      if (!entry) continue; // bye — no position row, match layer handles the gap
      const posResult = await client.query(`
        INSERT INTO tournament_draw_positions (draw_id, entry_id, player_id, seed, draw_position)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING *
      `, [drawId, entry.entry_id, entry.player_id, entry.seed || null, i + 1]);
      insertedPositions.push(posResult.rows[0]);
    }

    // Build round 1 matches by pairing adjacent slots (0&1, 2&3, ...).
    // A bye slot produces a match with only one player — the match layer
    // treats a null opponent as an automatic walkover when status is set.
    // bracket_slot is assigned explicitly here (i/2) rather than left to
    // be inferred later from row order — see migrate_tournament_engine_
    // bracket_slot.sql for why that inference is unreliable.
    const round1Matches = [];
    for (let i = 0; i < bracketSize; i += 2) {
      const a = slotAssignment[i];
      const b = slotAssignment[i + 1];
      const matchResult = await client.query(`
        INSERT INTO tournament_matches (draw_id, event_id, round_number, round_label, bracket_slot, player1_id, player2_id, status)
        VALUES ($1, $2, 1, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        drawId, draw.event_id, roundLabel(bracketSize, 1), i / 2,
        a ? a.player_id : null, b ? b.player_id : null,
        (a && b) ? 'scheduled' : 'walkover', // auto-advance byes immediately
      ]);
      round1Matches.push(matchResult.rows[0]);
    }

    await client.query(`
      UPDATE tournament_draws
      SET generated_at = NOW(), current_round = 1, updated_at = NOW()
      WHERE id = $1
    `, [drawId]);

    await client.query('COMMIT');

    return {
      ...draw,
      generated_at: new Date().toISOString(),
      current_round: 1,
      positions: insertedPositions,
      matches: round1Matches,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Human-readable round label from bracket size and round number —
// e.g. size 16, round 1 -> "Round of 16"; the last round is always "Final".
function roundLabel(bracketSize, roundNumber) {
  const totalRounds = Math.log2(bracketSize);
  const roundsFromEnd = totalRounds - roundNumber;
  if (roundsFromEnd === 0) return 'Final';
  if (roundsFromEnd === 1) return 'Semi-Final';
  if (roundsFromEnd === 2) return 'Quarter-Final';
  const playersInRound = bracketSize / Math.pow(2, roundNumber - 1);
  return `Round of ${playersInRound}`;
}

module.exports = {
  getDrawWithPositions,
  createDraw,
  generateBracket,
  roundLabel,
};
