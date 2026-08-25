const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const assertIncludes = (content, expected, message) => {
  if (!content.includes(expected)) throw new Error(message);
};

const migration = read('backend/scripts/migrate_011_session_participation_tracking.sql');
const participationService = read('backend/src/services/sessionParticipationService.js');
const sessionsRoute = read('backend/src/routes/sessions.js');
const playersRoute = read('backend/src/routes/players.js');
const retentionService = read('backend/src/services/retentionService.js');
const sessionsPage = read('frontend/src/pages/SessionReflection.jsx');
const playersPage = read('frontend/src/pages/PlayerRetention.jsx');

assertIncludes(migration, 'CREATE TABLE IF NOT EXISTS session_participants', 'Missing structured session participant ledger');
assertIncludes(migration, "CHECK (participation_status IN ('scheduled', 'attended', 'absent', 'excused'))", 'Attendance statuses must be constrained');
assertIncludes(migration, 'Backfill individual-session participants', 'Legacy individual sessions must be backfilled');
assertIncludes(migration, 'Backfill group-session participants', 'Legacy group sessions must be backfilled');
assertIncludes(migration, "ON CONFLICT (session_id, player_id) DO NOTHING", 'Historical backfill must be idempotent');

assertIncludes(participationService, 'validatePlayerIds', 'Participant links must validate against Player Register entries');
assertIncludes(participationService, 'syncSessionParticipants', 'Session participant rows must be synchronized');
assertIncludes(participationService, 'includeInactive', 'Historical attendance must remain recordable after a profile is archived');

assertIncludes(sessionsRoute, 'participant_ids', 'Session API must accept multiple structured participant IDs');
assertIncludes(sessionsRoute, 'syncSessionParticipants', 'Session creation/reflection must persist participant rows');
assertIncludes(sessionsRoute, 'participant_attendance', 'Session reflection must accept attendance confirmation');
assertIncludes(sessionsRoute, "participation_status = 'attended'", 'Completed reflections must confirm unresolved scheduled participation');
assertIncludes(sessionsRoute, 'participant_info.participants', 'Session list/detail must return participant context');

assertIncludes(playersRoute, 'session_participants sp', 'Player session summaries must use the structured participant ledger');
assertIncludes(playersRoute, 'session_history', 'Player Register profiles must expose session history');
assertIncludes(retentionService, 'FROM session_participants sp', 'Retention calculations must use participant attendance');
assertIncludes(retentionService, "sp.participation_status = 'attended'", 'Attended sessions must drive retention activity');

assertIncludes(sessionsPage, 'session-participants', 'Session logging UI must select additional Player Register participants');
assertIncludes(sessionsPage, 'participant_attendance', 'Reflection UI must capture attendance status');
assertIncludes(playersPage, 'player-session-history-title', 'Player Register UI must show session participation history');

console.log('session participation tracking checks: PASS');
