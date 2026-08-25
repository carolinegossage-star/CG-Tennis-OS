const { query } = require('../config/database');

const PARTICIPATION_STATUSES = ['scheduled', 'attended', 'absent', 'excused'];

function uniqueIds(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function normaliseParticipantIds({ playerId, playerGroup, participantIds }) {
  return uniqueIds([
    playerId,
    ...(Array.isArray(playerGroup) ? playerGroup : []),
    ...(Array.isArray(participantIds) ? participantIds : []),
  ]);
}

function normaliseAttendance(attendance = []) {
  if (!Array.isArray(attendance)) {
    throw Object.assign(new Error('participant_attendance must be an array'), { code: 'INVALID_PARTICIPATION' });
  }
  return attendance.reduce((map, entry) => {
    if (!entry?.player_id) return map;
    if (!PARTICIPATION_STATUSES.includes(entry.participation_status)) {
      throw Object.assign(new Error('Invalid participation status'), { code: 'INVALID_PARTICIPATION' });
    }
    map.set(entry.player_id, {
      participation_status: entry.participation_status,
      attendance_note: entry.attendance_note?.trim() || null,
    });
    return map;
  }, new Map());
}

async function validatePlayerIds(playerIds, coachId, db = { query }, { includeInactive = false } = {}) {
  const ids = uniqueIds(playerIds);
  if (!ids.length) return [];

  const result = await db.query(`
    SELECT id
    FROM players
    WHERE coach_id = $1
      AND ($3::boolean = true OR is_active = true)
      AND id = ANY($2::uuid[])
  `, [coachId, ids, includeInactive]);

  if (result.rows.length !== ids.length) {
    throw Object.assign(new Error('One or more selected players are unavailable in your active Player Register'), { code: 'INVALID_PARTICIPANTS' });
  }
  return ids;
}

async function syncSessionParticipants({ sessionId, coachId, playerIds, attendance = [], includeInactive = false, db = { query } }) {
  const ids = await validatePlayerIds(playerIds, coachId, db, { includeInactive });
  const attendanceByPlayer = normaliseAttendance(attendance);

  if (!ids.length) {
    await db.query('DELETE FROM session_participants WHERE session_id = $1 AND coach_id = $2', [sessionId, coachId]);
    return [];
  }

  await db.query(`
    DELETE FROM session_participants
    WHERE session_id = $1
      AND coach_id = $2
      AND player_id <> ALL($3::uuid[])
  `, [sessionId, coachId, ids]);

  for (const playerId of ids) {
    const attendanceEntry = attendanceByPlayer.get(playerId);
    await db.query(`
      INSERT INTO session_participants (
        session_id, player_id, coach_id, participation_status, attendance_note
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (session_id, player_id)
      DO UPDATE SET
        participation_status = CASE
          WHEN $6::boolean THEN EXCLUDED.participation_status
          ELSE session_participants.participation_status
        END,
        attendance_note = CASE
          WHEN $6::boolean THEN EXCLUDED.attendance_note
          ELSE session_participants.attendance_note
        END,
        updated_at = NOW()
    `, [
      sessionId,
      playerId,
      coachId,
      attendanceEntry?.participation_status || 'scheduled',
      attendanceEntry?.attendance_note || null,
      Boolean(attendanceEntry),
    ]);
  }

  return ids;
}

module.exports = {
  PARTICIPATION_STATUSES,
  normaliseParticipantIds,
  normaliseAttendance,
  validatePlayerIds,
  syncSessionParticipants,
};
