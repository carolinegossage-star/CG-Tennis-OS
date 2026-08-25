const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const includes = (content, text, message) => { if (!content.includes(text)) throw new Error(message); };
const excludes = (content, text, message) => { if (content.includes(text)) throw new Error(message); };

const migration = read('backend/scripts/migrate_013_manual_income_records.sql');
const incomeRoute = read('backend/src/routes/incomeRecords.js');
const server = read('backend/src/server.js');
const businessRoutes = read('backend/src/routes/allRoutes.js');
const app = read('frontend/src/App.jsx');
const sidebar = read('frontend/src/components/Sidebar.jsx');
const incomePage = read('frontend/src/pages/IncomeTracking.jsx');
const businessPage = read('frontend/src/pages/BusinessDashboard.jsx');

includes(migration, 'CREATE TABLE IF NOT EXISTS income_records', 'Manual income needs its own ledger table');
includes(migration, 'player_id', 'Income records must link to Player Register entries');
includes(migration, 'received_date', 'Income records must record received date');
includes(migration, 'amount', 'Income records must record amount');
includes(migration, 'note', 'Income records must support coach notes');
excludes(migration, 'stripe_', 'Manual income migration must not use Stripe fields');
excludes(migration, 'payment_intent', 'Manual income migration must not create payment intents');

includes(incomeRoute, "router.post('/', authenticate", 'Manual income API must support manual record creation');
includes(incomeRoute, 'validatePlayerOwnership', 'Income records must validate Player Register ownership');
includes(incomeRoute, 'router.get(\'/summary\'', 'Income summary must support period reporting and future renewal context');
includes(incomeRoute, 'open_credit_minutes', 'Income views must receive informational Session Credit context');
excludes(incomeRoute, 'stripeService', 'Manual income API must not use Stripe services');
excludes(incomeRoute, 'createCheckoutSession', 'Manual income API must not start a checkout');
excludes(incomeRoute, 'paymentIntent', 'Manual income API must not create payment intents');
includes(server, "app.use('/income-records', incomeRecordRoutes);", 'Manual income API must be mounted independently');

includes(businessRoutes, 'FROM income_records', 'Business Dashboard income KPI must use the manual income ledger');
includes(app, "path=\"/income\"", 'Income page must be protected by an application route');
includes(sidebar, "href: '/income'", 'Income page must be reachable through system navigation');
includes(incomePage, 'Record income received', 'Income page needs a clear manual-recording CTA');
includes(incomePage, 'Session Credit context', 'Income form must show player credit context without applying it');
includes(incomePage, 'never applies, offsets, resolves, or changes this balance automatically', 'Income form must explain Session Credit separation');
includes(incomePage, 'bg-gradient-to-r from-emerald-600 to-teal-600', 'Income page should use a visually distinct income CTA');
includes(businessPage, 'Record income received', 'Business Dashboard must provide a visible income CTA');

console.log('manual income recording checks: PASS');
