// ============================================================
// CG Tennis OS™ — TOURNAMENT EVENT SERVICE
// Data layer for tournamentEvents.js routes.
// © CG Tennis Academies. All Rights Reserved.
// ============================================================
//
// Written against the real schema in migrate_tournament_engine.sql —
// every column name below was checked against that file, not assumed.

const { query } = require('../config/database');

// ─── Reads ──────────────────────────────────────────────────────────────────────

async function listEvents({ status, tournamentId, visibility } = {}) {
  const conditions = [];
  const params = [];
  let i = 1;

  if (status)        { conditions.push(`e.status = $${i++}`);        params.push(status); }
  if (tournamentId)  { conditions.push(`e.tournament_id = $${i++}`);  params.push(tournamentId); }
  if (visibility)    { conditions.push(`e.visibility = $${i++}`);     params.push(visibility); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(`
    SELECT
      e.*,
      t.name AS tournament_name,
      v.name AS venue_name,
      (SELECT COUNT(*) FROM tournament_entries te WHERE te.tournament_id = e.tournament_id) AS entry_count
    FROM tournament_events e
    JOIN tournaments t ON t.id = e.tournament_id
    LEFT JOIN tournament_venues v ON v.id = e.venue_id
    ${where}
    ORDER BY e.event_start_date ASC NULLS LAST, e.created_at DESC
  `, params);

  return result.rows;
}

async function getEvent(id) {
  const result = await query(`
    SELECT
      e.*,
      t.name AS tournament_name,
      t.start_date AS tournament_start_date,
      t.end_date AS tournament_end_date,
      v.name AS venue_name,
      v.court_names AS venue_court_names,
      rr.registration_open_date, rr.registration_close_date,
      rr.min_age, rr.max_age, rr.gender_restriction,
      rr.access_level, rr.max_entrants
    FROM tournament_events e
    JOIN tournaments t ON t.id = e.tournament_id
    LEFT JOIN tournament_venues v ON v.id = e.venue_id
    LEFT JOIN tournament_event_registration_rules rr ON rr.event_id = e.id
    WHERE e.id = $1
  `, [id]);

  return result.rows[0] || null;
}

// ─── Admin: create / update / status ───────────────────────────────────────────

async function createEvent(coachId, body) {
  const {
    tournamentId, title, level, category, surface, venueId,
    format = 'knockout', eventStartDate, eventEndDate,
    organiserName, hostClub,
  } = body;

  const result = await query(`
    INSERT INTO tournament_events (
      tournament_id, title, level, category, surface, venue_id,
      format, event_start_date, event_end_date,
      organiser_name, host_club, created_by
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *
  `, [
    tournamentId, title, level || null, category || null, surface || null, venueId || null,
    format, eventStartDate || null, eventEndDate || null,
    organiserName || null, hostClub || null, coachId,
  ]);

  return result.rows[0];
}

async function updateEvent(id, body) {
  // Build the SET clause dynamically from whichever fields were sent —
  // avoids overwriting columns the caller didn't intend to touch.
  const allowed = ['title', 'level', 'category', 'surface', 'venue_id', 'format',
    'event_start_date', 'event_end_date', 'organiser_name', 'host_club', 'visibility'];
  const sets = [];
  const params = [];
  let i = 1;

  for (const key of allowed) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (body[camelKey] !== undefined) {
      sets.push(`${key} = $${i++}`);
      params.push(body[camelKey]);
    }
  }

  if (sets.length === 0) {
    const existing = await getEvent(id);
    if (!existing) throw new Error('Event not found');
    return existing;
  }

  sets.push(`updated_at = NOW()`);
  params.push(id);

  const result = await query(`
    UPDATE tournament_events SET ${sets.join(', ')}
    WHERE id = $${i}
    RETURNING *
  `, params);

  if (!result.rows[0]) throw new Error('Event not found');
  return result.rows[0];
}

async function setEventStatus(id, status, userId) {
  const timestampCol = status === 'published' ? 'published_at' : status === 'archived' ? 'archived_at' : null;
  const setClause = timestampCol
    ? `status = $1, ${timestampCol} = NOW(), updated_at = NOW()`
    : `status = $1, updated_at = NOW()`;

  const result = await query(`
    UPDATE tournament_events SET ${setClause}
    WHERE id = $2
    RETURNING *
  `, [status, id]);

  if (!result.rows[0]) throw new Error('Event not found');
  return result.rows[0];
}

// ─── Registration rules ────────────────────────────────────────────────────────

async function setRegistrationRules(eventId, body) {
  const {
    registrationOpenDate, registrationCloseDate,
    minAge, maxAge, genderRestriction,
    rankingBandMin, rankingBandMax, membershipRequired,
    customEligibilityRules = [],
    isPaidEntry, entryFeeOverride, lateEntryAllowed, lateEntryFee, lateEntryCutoff,
    accessLevel = 'open', maxEntrants,
  } = body;

  // Upsert — one rules row per event (UNIQUE constraint on event_id)
  const result = await query(`
    INSERT INTO tournament_event_registration_rules (
      event_id, registration_open_date, registration_close_date,
      min_age, max_age, gender_restriction,
      ranking_band_min, ranking_band_max, membership_required,
      custom_eligibility_rules,
      is_paid_entry, entry_fee_override, late_entry_allowed, late_entry_fee, late_entry_cutoff,
      access_level, max_entrants
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT (event_id) DO UPDATE SET
      registration_open_date = EXCLUDED.registration_open_date,
      registration_close_date = EXCLUDED.registration_close_date,
      min_age = EXCLUDED.min_age,
      max_age = EXCLUDED.max_age,
      gender_restriction = EXCLUDED.gender_restriction,
      ranking_band_min = EXCLUDED.ranking_band_min,
      ranking_band_max = EXCLUDED.ranking_band_max,
      membership_required = EXCLUDED.membership_required,
      custom_eligibility_rules = EXCLUDED.custom_eligibility_rules,
      is_paid_entry = EXCLUDED.is_paid_entry,
      entry_fee_override = EXCLUDED.entry_fee_override,
      late_entry_allowed = EXCLUDED.late_entry_allowed,
      late_entry_fee = EXCLUDED.late_entry_fee,
      late_entry_cutoff = EXCLUDED.late_entry_cutoff,
      access_level = EXCLUDED.access_level,
      max_entrants = EXCLUDED.max_entrants,
      updated_at = NOW()
    RETURNING *
  `, [
    eventId, registrationOpenDate || null, registrationCloseDate || null,
    minAge || null, maxAge || null, genderRestriction || null,
    rankingBandMin || null, rankingBandMax || null, membershipRequired || false,
    JSON.stringify(customEligibilityRules),
    isPaidEntry || false, entryFeeOverride || null, lateEntryAllowed || false, lateEntryFee || null, lateEntryCutoff || null,
    accessLevel, maxEntrants || null,
  ]);

  return result.rows[0];
}

async function checkEligibility(eventId, playerId) {
  const [rulesRes, playerRes] = await Promise.all([
    query('SELECT * FROM tournament_event_registration_rules WHERE event_id = $1', [eventId]),
    query('SELECT id, date_of_birth, gender, ranking_current FROM players WHERE id = $1', [playerId]),
  ]);

  const rules = rulesRes.rows[0];
  const player = playerRes.rows[0];

  if (!player) return { eligible: false, reasons: ['Player not found'] };
  if (!rules)  return { eligible: true, reasons: [] }; // no rules set = open entry

  const reasons = [];

  if (rules.min_age != null || rules.max_age != null) {
    const age = player.date_of_birth
      ? Math.floor((Date.now() - new Date(player.date_of_birth).getTime()) / 31557600000)
      : null;
    if (age == null) reasons.push('Player date of birth not on file — cannot verify age eligibility');
    else {
      if (rules.min_age != null && age < rules.min_age) reasons.push(`Player is below the minimum age (${rules.min_age})`);
      if (rules.max_age != null && age > rules.max_age) reasons.push(`Player exceeds the maximum age (${rules.max_age})`);
    }
  }

  if (rules.gender_restriction && player.gender && rules.gender_restriction !== 'mixed'
      && player.gender.toLowerCase() !== rules.gender_restriction.toLowerCase()) {
    reasons.push(`Event is restricted to ${rules.gender_restriction} entrants`);
  }

  if (rules.ranking_band_min != null && player.ranking_current != null && player.ranking_current < rules.ranking_band_min) {
    reasons.push(`Player ranking is outside the eligible band (min ${rules.ranking_band_min})`);
  }
  if (rules.ranking_band_max != null && player.ranking_current != null && player.ranking_current > rules.ranking_band_max) {
    reasons.push(`Player ranking is outside the eligible band (max ${rules.ranking_band_max})`);
  }

  return { eligible: reasons.length === 0, reasons };
}

// ─── Check-in ───────────────────────────────────────────────────────────────────

async function checkInEntry(eventId, entryId, userId) {
  const result = await query(`
    INSERT INTO tournament_event_checkins (event_id, entry_id, checked_in, checked_in_at, checked_in_by)
    VALUES ($1, $2, true, NOW(), $3)
    ON CONFLICT (event_id, entry_id) DO UPDATE SET
      checked_in = true, checked_in_at = NOW(), checked_in_by = EXCLUDED.checked_in_by
    RETURNING *
  `, [eventId, entryId, userId]);

  return result.rows[0];
}

// ─── Coaching-value dashboard aggregate ──────────────────────────────────────
// The single call the Live Event Dashboard page depends on. Deliberately
// combines event summary + "my players in this event" + their next
// matches into one response, rather than making the frontend stitch
// together three separate round trips on every poll (this endpoint is
// polled every 30s by useTournamentLive.js).

async function getEventDashboard(eventId, coachId) {
  const event = await getEvent(eventId);
  if (!event) throw new Error('Event not found');

  // Players belonging to this coach who are entered in the parent tournament
  const playersResult = await query(`
    SELECT
      p.id, p.name AS full_name, p.ranking_current, p.ranking_trajectory,
      te.entry_status
    FROM players p
    JOIN tournament_entries te ON te.player_id = p.id
    WHERE p.coach_id = $1
      AND te.tournament_id = $2
  `, [coachId, event.tournament_id]);

  const myPlayers = playersResult.rows;
  const myPlayerIds = myPlayers.map(p => p.id);

  // Prep notes and reflections — pulled from the existing sessions table,
  // filtered to this event (see migrate_tournament_engine.sql section 10).
  // Real columns confirmed against migrate.sql: session_plan (JSONB) holds
  // pre-session planning content, reflection_text holds the post-session
  // write-up — there is no separate pre_session_notes/post_session_reflection
  // column, despite those names appearing in earlier draft code.
  let sessionsByPlayer = {};
  if (myPlayerIds.length > 0) {
    const sessionsResult = await query(`
      SELECT player_id, session_date, session_plan, reflection_text
      FROM sessions
      WHERE related_tournament_event_id = $1
        AND player_id = ANY($2::uuid[])
      ORDER BY session_date DESC
    `, [eventId, myPlayerIds]);

    sessionsByPlayer = sessionsResult.rows.reduce((acc, row) => {
      (acc[row.player_id] ??= []).push(row);
      return acc;
    }, {});
  }

  const today = new Date().toISOString().slice(0, 10);
  const myPlayersWithContext = myPlayers.map(p => {
    const sessions = sessionsByPlayer[p.id] || [];
    return {
      ...p,
      today_prep_notes: sessions
        .filter(s => s.session_date && new Date(s.session_date).toISOString().slice(0, 10) === today && s.session_plan?.notes)
        .map(s => ({ notes: s.session_plan.notes })),
      post_match_reflections: sessions
        .filter(s => s.reflection_text)
        .slice(0, 3)
        .map(s => ({ reflection_text: s.reflection_text })),
    };
  });

  // Next matches involving any of this coach's players in this event
  let upcomingMatches = [];
  if (myPlayerIds.length > 0) {
    const matchesResult = await query(`
      SELECT
        m.id, m.round_label, m.court_name AS court_label, m.scheduled_time, m.status,
        p1.name AS player1_name, m.player1_id,
        p2.name AS player2_name, m.player2_id
      FROM tournament_matches m
      LEFT JOIN players p1 ON p1.id = m.player1_id
      LEFT JOIN players p2 ON p2.id = m.player2_id
      WHERE m.event_id = $1
        AND m.status IN ('scheduled', 'upcoming')
        AND (m.player1_id = ANY($2::uuid[]) OR m.player2_id = ANY($2::uuid[]))
      ORDER BY m.scheduled_time ASC NULLS LAST
      LIMIT 5
    `, [eventId, myPlayerIds]);
    upcomingMatches = matchesResult.rows;
  }

  return {
    event,
    myPlayers: myPlayersWithContext,
    upcomingMatches,
    // No AI-generated summary yet — aiService exists and could power this
    // later (see backend/src/services/aiService.js), deliberately left
    // null for now rather than faking a call that isn't wired up.
    coachingInsights: null,
  };
}

module.exports = {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  setEventStatus,
  setRegistrationRules,
  checkEligibility,
  checkInEntry,
  getEventDashboard,
};
