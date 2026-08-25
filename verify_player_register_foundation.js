const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const assertIncludes = (content, expected, message) => {
  if (!content.includes(expected)) throw new Error(message);
};

const migration = read('backend/scripts/migrate_010_player_register_foundation.sql');
const playerRoutes = read('backend/src/routes/players.js');
const playerPage = read('frontend/src/pages/PlayerRetention.jsx');
const businessRoutes = read('backend/src/routes/allRoutes.js');
const businessPage = read('frontend/src/pages/BusinessDashboard.jsx');

assertIncludes(migration, 'ADD COLUMN IF NOT EXISTS enrolment_date DATE', 'Missing enrolment-date schema field');
assertIncludes(migration, 'SET enrolment_date = created_at::date', 'Existing players must be backfilled safely');
assertIncludes(migration, 'ALTER COLUMN enrolment_date SET NOT NULL', 'Enrolment date must be a durable Register value');

assertIncludes(playerRoutes, "body('enrolment_date')", 'Player creation must validate enrolment date');
assertIncludes(playerRoutes, 'enrolment_date || new Date()', 'New Player Register entries must receive an enrolment date');
assertIncludes(playerRoutes, "'enrolment_date'", 'Player updates must allow enrolment-date correction');
assertIncludes(playerRoutes, "if (active !== 'all')", 'Player Register must support active, inactive, and all-status views');
assertIncludes(playerRoutes, 'programme_ids', 'Player Register must retain structured Programme assignments');

assertIncludes(playerPage, 'player-enrolment-date', 'Player Register form is missing enrolment-date capture');
assertIncludes(playerPage, 'player-active-status', 'Player Register form is missing active/inactive lifecycle management');
assertIncludes(playerPage, 'player-status-filter', 'Player Register page is missing inactive-profile access');
assertIncludes(playerPage, 'player-programmes', 'Player Register page is missing structured Programme assignment');

assertIncludes(businessRoutes, "dashboard-summary", 'Business Dashboard needs a shared live Register summary route');
assertIncludes(businessRoutes, 'FROM players WHERE coach_id = $1 AND is_active = true', 'Business Active Players must derive from the Player Register');
assertIncludes(businessPage, '/dashboard-summary', 'Business Dashboard is not using the shared Register summary');

console.log('player register foundation checks: PASS');
