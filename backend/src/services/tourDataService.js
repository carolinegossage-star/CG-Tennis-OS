// ============================================================
// CG Tennis OS™ — TOUR DATA SYNC SERVICE
// "Apex Tour Intelligence™" — pulls live ATP/WTA/ITF/Challenger data
// © CG Tennis Academies. All Rights Reserved.
// ============================================================
//
// PROVIDER NOTE: This is written against a generic "tennis data provider"
// shape. Swap the fetchFromProvider() implementation for whichever service
// is chosen (Sofascore unofficial API, RapidAPI Tennis, or Sportmonks).
// The rest of the pipeline (normalise → upsert → flag live → trigger curation)
// stays the same regardless of provider.

const { query } = require('../config/database');
const wsService = require('./wsService');
const logger = require('../utils/logger');

const PROVIDER = process.env.TOUR_DATA_PROVIDER || 'sofascore';
const API_KEY = process.env.TOUR_DATA_API_KEY;
const API_BASE_URL = process.env.TOUR_DATA_API_URL;

// ─── Fetch From External Provider ─────────────────────────────────────────────
async function fetchFromProvider(endpoint, params = {}) {
  if (!API_BASE_URL) {
    logger.warn('TOUR_DATA_API_URL not configured — skipping sync');
    return null;
  }

  const url = new URL(endpoint, API_BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: API_KEY ? { 'X-API-Key': API_KEY, 'Authorization': `Bearer ${API_KEY}` } : {},
  });

  if (!res.ok) {
    throw new Error(`Tour data provider returned ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ─── Normalise Provider Tier → Internal Enum ──────────────────────────────────
function normaliseTier(rawTier = '') {
  const t = rawTier.toLowerCase();
  if (t.includes('grand slam') || t.includes('grandslam')) return 'grand_slam';
  if (t.includes('1000')) return t.includes('wta') ? 'wta_1000' : 'atp_1000';
  if (t.includes('500')) return t.includes('wta') ? 'wta_500' : 'atp_500';
  if (t.includes('250')) return t.includes('wta') ? 'wta_250' : 'atp_250';
  if (t.includes('challenger')) {
    if (t.includes('125')) return 'challenger_125';
    if (t.includes('100')) return 'challenger_100';
    if (t.includes('75')) return 'challenger_75';
    return 'challenger_50';
  }
  if (t.includes('w100') || t.includes('itf 100')) return 'itf_w100';
  if (t.includes('w75') || t.includes('itf 75')) return 'itf_w75';
  if (t.includes('w60')) return 'itf_w60';
  if (t.includes('w40')) return 'itf_w40';
  if (t.includes('w25')) return 'itf_w25';
  if (t.includes('w15')) return 'itf_w15';
  if (t.includes('junior')) return 'itf_juniors';
  if (t.includes('utr')) return 'utr_pro';
  return 'itf_w15'; // safest default
}

// ─── Sync Events (Tournaments) ────────────────────────────────────────────────
async function syncEvents() {
  logger.info('Starting tour event sync...', { provider: PROVIDER });

  try {
    const data = await fetchFromProvider('/events/current-week');
    if (!data?.events) {
      logger.warn('No events returned from provider');
      return { synced: 0 };
    }

    let syncedCount = 0;

    for (const ev of data.events) {
      const tier = normaliseTier(ev.category || ev.tier || '');

      await query(`
        INSERT INTO tour_events (
          external_id, provider, name, tier, surface_type,
          location_city, location_country, location_lat, location_lng,
          timezone_offset, start_date, end_date, draw_size,
          prize_money, prize_money_currency, status, raw_payload, last_synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
        ON CONFLICT (external_id) DO UPDATE SET
          status = EXCLUDED.status,
          raw_payload = EXCLUDED.raw_payload,
          last_synced_at = NOW()
      `, [
        ev.id, PROVIDER, ev.name, tier, ev.surface?.toLowerCase() || null,
        ev.city || null, ev.country || null, ev.lat || null, ev.lng || null,
        ev.utcOffset || null, ev.startDate, ev.endDate, ev.drawSize || null,
        ev.prizeMoney || null, ev.currency || 'USD',
        ev.status || 'upcoming', JSON.stringify(ev),
      ]);
      syncedCount++;
    }

    logger.info(`Tour event sync complete — ${syncedCount} events`, { provider: PROVIDER });
    return { synced: syncedCount };
  } catch (err) {
    logger.error('Tour event sync failed', { error: err.message });
    throw err;
  }
}

// ─── Sync Live Matches (more frequent, lighter payload) ──────────────────────
async function syncLiveMatches() {
  try {
    const data = await fetchFromProvider('/matches/live');
    if (!data?.matches) return { synced: 0 };

    let syncedCount = 0;
    const liveEventIds = new Set();

    for (const m of data.matches) {
      const eventResult = await query(
        'SELECT id FROM tour_events WHERE external_id = $1',
        [m.eventId]
      );
      if (!eventResult.rows.length) continue; // event not synced yet, skip match

      const eventId = eventResult.rows[0].id;
      liveEventIds.add(eventId);

      await query(`
        INSERT INTO tour_matches (
          external_id, event_id, round_name, player_a_name, player_b_name,
          player_a_country, player_b_country, player_a_rank, player_b_rank,
          score_summary, current_set, status, winner_name, scheduled_time,
          raw_payload, last_synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
        ON CONFLICT (external_id) DO UPDATE SET
          score_summary = EXCLUDED.score_summary,
          current_set = EXCLUDED.current_set,
          status = EXCLUDED.status,
          winner_name = EXCLUDED.winner_name,
          raw_payload = EXCLUDED.raw_payload,
          last_synced_at = NOW()
      `, [
        m.id, eventId, m.round || null, m.playerA?.name, m.playerB?.name,
        m.playerA?.country || null, m.playerB?.country || null,
        m.playerA?.rank || null, m.playerB?.rank || null,
        m.scoreSummary || null, m.currentSet || null,
        m.status || 'live', m.winner || null, m.scheduledTime || null,
        JSON.stringify(m),
      ]);
      syncedCount++;
    }

    // Update is_live_now + active_match_count on events
    for (const eventId of liveEventIds) {
      const countResult = await query(
        `SELECT COUNT(*) FROM tour_matches WHERE event_id = $1 AND status = 'live'`,
        [eventId]
      );
      const activeCount = parseInt(countResult.rows[0].count);
      await query(
        'UPDATE tour_events SET is_live_now = $1, active_match_count = $2 WHERE id = $3',
        [activeCount > 0, activeCount, eventId]
      );
    }

    return { synced: syncedCount };
  } catch (err) {
    logger.error('Live match sync failed', { error: err.message });
    throw err;
  }
}

// ─── Get Current Week Snapshot (for map + grid display) ─────────────────────
async function getCurrentWeekSnapshot(filters = {}) {
  const { tier, surface, liveOnly } = filters;

  let sql = `
    SELECT te.*,
      (SELECT COUNT(*) FROM tour_curation_notes tcn WHERE tcn.event_id = te.id AND tcn.is_published = true) as has_curation
    FROM tour_events te
    WHERE te.end_date >= CURRENT_DATE AND te.start_date <= CURRENT_DATE + INTERVAL '7 days'
  `;
  const params = [];
  let idx = 1;

  if (tier) { sql += ` AND te.tier = $${idx++}`; params.push(tier); }
  if (surface) { sql += ` AND te.surface_type = $${idx++}`; params.push(surface); }
  if (liveOnly) { sql += ` AND te.is_live_now = true`; }

  sql += ' ORDER BY te.is_live_now DESC, te.start_date ASC';

  const result = await query(sql, params);
  return result.rows;
}

// ─── Run Full Sync Cycle (called by cron) ────────────────────────────────────
async function runSyncCycle() {
  logger.info('Running full tour data sync cycle...');
  try {
    const eventsResult = await syncEvents();
    const matchesResult = await syncLiveMatches();

    // Broadcast live update to any connected public-layer clients
    wsService.broadcast({
      type: 'TOUR_DATA_UPDATED',
      eventsSynced: eventsResult.synced,
      matchesSynced: matchesResult.synced,
      timestamp: new Date().toISOString(),
    });

    logger.info('Tour sync cycle complete', { ...eventsResult, ...matchesResult });
    return { events: eventsResult.synced, matches: matchesResult.synced };
  } catch (err) {
    logger.error('Tour sync cycle failed', { error: err.message });
    // Non-fatal — the daily scan rule will alert if this keeps failing
  }
}

module.exports = {
  syncEvents,
  syncLiveMatches,
  getCurrentWeekSnapshot,
  runSyncCycle,
};
