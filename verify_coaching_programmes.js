const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const requireText = (content, expected, message) => {
  if (!content.includes(expected)) throw new Error(message);
};

const migration = read('backend/scripts/migrate_009_coaching_programmes.sql');
const programmesRoute = read('backend/src/routes/programmes.js');
const playersRoute = read('backend/src/routes/players.js');
const sessionsRoute = read('backend/src/routes/sessions.js');
const playerPage = read('frontend/src/pages/PlayerRetention.jsx');
const sessionsPage = read('frontend/src/pages/SessionReflection.jsx');
const programmesPage = read('frontend/src/pages/CoachingProgrammes.jsx');
const app = read('frontend/src/App.jsx');

requireText(migration, 'CREATE TABLE IF NOT EXISTS coaching_programmes', 'Missing coaching_programmes table');
requireText(migration, 'CREATE TABLE IF NOT EXISTS player_programmes', 'Missing structured player-programme assignment table');
requireText(migration, 'ADD COLUMN IF NOT EXISTS programme_id', 'Missing optional sessions.programme_id link');
requireText(migration, 'ON DELETE SET NULL', 'Programme archival/removal must not delete session history');
requireText(migration, 'Existing session rows intentionally retain a NULL programme_id', 'Migration must explicitly preserve historical session compatibility');

requireText(programmesRoute, "router.get('/analytics/activity'", 'Missing Programme activity analytics endpoint');
requireText(programmesRoute, "router.post('/', authenticate", 'Missing Programme create endpoint');
requireText(programmesRoute, "router.put('/:id'", 'Missing Programme update endpoint');
requireText(programmesRoute, "router.delete('/:id'", 'Missing Programme archive endpoint');
requireText(programmesRoute, 'programme_type', 'Programme type must be structured in the API');
requireText(programmesRoute, 'days_of_week', 'Programme weekday schedule must be structured in the API');

requireText(playersRoute, 'syncPlayerProgrammes', 'Player API must synchronize Programme assignments');
requireText(playersRoute, 'programme_ids', 'Player API must accept Programme IDs');
requireText(playersRoute, 'programme_info.programmes', 'Player API must return Programme context');

requireText(sessionsRoute, 'programme_id', 'Session API must accept Programme IDs');
requireText(sessionsRoute, "programme ? programme.programme_type !== 'individual' : is_group_session", 'Programme sessions must derive group semantics while preserving the legacy fallback');
requireText(sessionsRoute, "programme.programme_type === 'pair' ? 'group' : programme.programme_type", 'Programme sessions must preserve the legacy session_type vocabulary for existing consumers');

requireText(playerPage, 'player-programmes', 'Player register is missing Programme selection control');
requireText(playerPage, 'programme_ids', 'Player register is not submitting Programme IDs');
requireText(sessionsPage, 'session-programme', 'Session logging is missing Programme selection control');
requireText(sessionsPage, 'Ad-hoc session type', 'Session logging is missing the explicit legacy fallback');
requireText(programmesPage, 'Coaching Programmes', 'Programme management page is missing');
requireText(app, 'path="/programmes"', 'Programme management route is missing');

console.log('coaching programmes checks: PASS');
