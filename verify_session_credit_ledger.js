const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const assertIncludes = (content, expected, message) => {
  if (!content.includes(expected)) throw new Error(message);
};
const assertExcludes = (content, unexpected, message) => {
  if (content.includes(unexpected)) throw new Error(message);
};

const migration = read('backend/scripts/migrate_012_session_credit_ledger.sql');
const creditRoute = read('backend/src/routes/sessionCredits.js');
const server = read('backend/src/server.js');
const playerRoute = read('backend/src/routes/players.js');
const participationService = read('backend/src/services/sessionParticipationService.js');
const retentionService = read('backend/src/services/retentionService.js');
const reflectionPage = read('frontend/src/pages/SessionReflection.jsx');
const playerPage = read('frontend/src/pages/PlayerRetention.jsx');

assertIncludes(migration, 'CREATE TABLE IF NOT EXISTS session_credits', 'Session Credit must use its own database table');
assertIncludes(migration, 'credit_minutes', 'Session Credit must be measured in minutes');
assertIncludes(migration, 'is_resolved', 'Session Credit must support a manually resolved time balance');
assertExcludes(migration, 'ALTER TABLE session_participants', 'Session Credit migration must not alter the attendance ledger');
assertExcludes(migration, 'stripe', 'Session Credit migration must not connect to Stripe');

assertIncludes(creditRoute, "router.get('/summary'", 'Session Credit summary hook is required for future income and renewal views');
assertIncludes(creditRoute, 'resolveCreditMinutes', 'Session Credit must support shortfall and direct-minute entries');
assertIncludes(creditRoute, 'session_participants', 'Session-linked credit must validate against session participants');
assertExcludes(creditRoute, 'retentionService', 'Session Credit route must not call retention services');
assertExcludes(creditRoute, 'stripe', 'Session Credit route must not call Stripe');
assertIncludes(server, "app.use('/session-credits', sessionCreditRoutes);", 'Session Credit route must be mounted separately');

assertIncludes(playerRoute, 'open_credit_minutes', 'Player Register must expose time owed balance');
assertIncludes(playerRoute, 'session_credits', 'Player Register profile must expose credit ledger entries');
assertIncludes(participationService, "['scheduled', 'attended', 'absent', 'excused']", 'Attendance status vocabulary must remain unchanged');
assertExcludes(retentionService, 'session_credits', 'Retention queries must remain isolated from Session Credit');

assertIncludes(reflectionPage, 'session_credit_enabled', 'Reflection UI must allow optional Session Credit entry');
assertIncludes(reflectionPage, '/session-credits', 'Reflection UI must save credit through its independent API');
assertIncludes(reflectionPage, 'does not affect retention, invoices, Stripe or payments', 'Reflection UI must disclose the credit boundary');
assertIncludes(playerPage, 'player-credit-title', 'Player Register must visibly surface Session Credit');
assertIncludes(playerPage, 'Mark time made up', 'Player Register must allow manual time-credit resolution');

console.log('session credit ledger checks: PASS');
