// ============================================================
// CG Tennis OS™ — TOURNAMENT NOTIFICATION SERVICE
// Wires tournament events into the EXISTING alert system rather than
// building a parallel one. © CG Tennis Academies. All Rights Reserved.
// ============================================================
//
// alertService.createAlert() already does WebSocket push + urgent-email
// — this file's only job is calling it with the right tournament-specific
// alert_type, title, and message for each trigger point. The new
// alert_type ENUM values are added in migrate_tournament_engine_enum.sql.

const { query } = require('../config/database');
const alertService = require('./alertService');

// Resolves which coach(es) should be notified about a given player —
// currently the player's assigned coach via players.coach_id. If a
// player has no coach_id set, this safely returns nothing rather than
// erroring, since not every player record is guaranteed to have one.
async function getCoachIdsForPlayer(playerId) {
  const result = await query('SELECT coach_id FROM players WHERE id = $1 AND coach_id IS NOT NULL', [playerId]);
  return result.rows.map((r) => r.coach_id);
}

async function notifyMatchStartingSoon(match) {
  const playerIds = [match.player1_id, match.player2_id].filter(Boolean);
  for (const playerId of playerIds) {
    const coachIds = await getCoachIdsForPlayer(playerId);
    for (const coachId of coachIds) {
      await alertService.createAlert({
        userId: coachId,
        relatedPlayerId: playerId,
        alertType: 'match_starting_soon',
        severity: 'warning',
        title: 'Match starting soon',
        message: `${match.round_label || 'Match'} on ${match.court_name || 'court TBC'} is starting soon.`,
        actionUrl: `/tournaments/events/${match.event_id}/matches/${match.id}`,
        actionLabel: 'View match',
      });
    }
  }
}

async function notifyMatchResult(match) {
  const playerIds = [match.player1_id, match.player2_id].filter(Boolean);
  for (const playerId of playerIds) {
    const coachIds = await getCoachIdsForPlayer(playerId);
    const won = match.winner_id === playerId;
    for (const coachId of coachIds) {
      await alertService.createAlert({
        userId: coachId,
        relatedPlayerId: playerId,
        alertType: 'match_result',
        severity: 'info',
        title: won ? 'Match won' : 'Match result in',
        message: `${match.round_label || 'Match'} result: ${won ? 'won' : 'completed'}.`,
        actionUrl: `/tournaments/events/${match.event_id}/matches/${match.id}`,
        actionLabel: 'View result',
      });
    }
  }
}

async function notifyDrawPublished(event, entryPlayerIds) {
  for (const playerId of entryPlayerIds) {
    const coachIds = await getCoachIdsForPlayer(playerId);
    for (const coachId of coachIds) {
      await alertService.createAlert({
        userId: coachId,
        relatedPlayerId: playerId,
        alertType: 'draw_published',
        severity: 'info',
        title: 'Draw published',
        message: `The draw for ${event.title} is now live.`,
        actionUrl: `/tournaments/events/${event.id}/draw`,
        actionLabel: 'View draw',
      });
    }
  }
}

async function notifyDrawChanged(event, affectedPlayerIds, reason) {
  for (const playerId of affectedPlayerIds) {
    const coachIds = await getCoachIdsForPlayer(playerId);
    for (const coachId of coachIds) {
      await alertService.createAlert({
        userId: coachId,
        relatedPlayerId: playerId,
        alertType: 'draw_changed',
        severity: 'warning',
        title: 'Draw changed',
        message: `The draw for ${event.title} has changed${reason ? `: ${reason}` : '.'}`,
        actionUrl: `/tournaments/events/${event.id}/draw`,
        actionLabel: 'View draw',
      });
    }
  }
}

async function notifyScheduleChanged(match, reason) {
  const playerIds = [match.player1_id, match.player2_id].filter(Boolean);
  for (const playerId of playerIds) {
    const coachIds = await getCoachIdsForPlayer(playerId);
    for (const coachId of coachIds) {
      await alertService.createAlert({
        userId: coachId,
        relatedPlayerId: playerId,
        alertType: 'schedule_changed',
        severity: 'warning',
        title: 'Schedule changed',
        message: `${match.round_label || 'Match'} schedule has changed${reason ? `: ${reason}` : '.'}`,
        actionUrl: `/tournaments/events/${match.event_id}/matches/${match.id}`,
        actionLabel: 'View match',
      });
    }
  }
}

async function notifyCheckinReminder(eventId, playerId) {
  const coachIds = await getCoachIdsForPlayer(playerId);
  for (const coachId of coachIds) {
    await alertService.createAlert({
      userId: coachId,
      relatedPlayerId: playerId,
      relatedTournamentId: eventId,
      alertType: 'checkin_reminder',
      severity: 'warning',
      title: 'Check-in reminder',
      message: 'Your player needs to check in for their upcoming event.',
      actionLabel: 'Check in now',
    });
  }
}

module.exports = {
  notifyMatchStartingSoon,
  notifyMatchResult,
  notifyDrawPublished,
  notifyDrawChanged,
  notifyScheduleChanged,
  notifyCheckinReminder,
};
