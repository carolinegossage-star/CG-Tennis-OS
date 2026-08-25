const fs = require('fs');
const path = require('path');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const includes = (content, text, message) => { if (!content.includes(text)) throw new Error(message); };
const excludes = (content, text, message) => { if (content.includes(text)) throw new Error(message); };

const migration = read('backend/scripts/migrate_014_packages_and_renewals.sql');
const route = read('backend/src/routes/renewals.js');
const server = read('backend/src/server.js');
const players = read('backend/src/routes/players.js');
const app = read('frontend/src/App.jsx');
const sidebar = read('frontend/src/components/Sidebar.jsx');
const renewalPage = read('frontend/src/pages/RenewalsTracking.jsx');
const retention = read('backend/src/services/retentionService.js');

includes(migration, 'CREATE TABLE IF NOT EXISTS coaching_packages', 'Packages require their own structured table');
includes(migration, 'CREATE TABLE IF NOT EXISTS player_package_enrolments', 'Renewal periods require player-linked structured enrolments');
includes(migration, 'programme_id', 'Packages and enrolments must reference structured Coaching Programmes');
includes(migration, 'renewal_date', 'Enrolments must track renewal or expiry dates');
includes(migration, 'duration_days', 'Enrolment terms must snapshot package duration');
includes(migration, 'price_reference', 'Enrolment terms must preserve the private package price reference');
excludes(migration, 'stripe_', 'Package migration must not use Stripe state');
excludes(migration, 'payment_intent', 'Package migration must not create payment intents');

includes(route, "router.post('/packages'", 'Coach must be able to create structured packages');
includes(route, "router.post('/enrolments'", 'Coach must be able to link a package to a Player Register entry');
includes(route, "router.post('/enrolments/:id/renew'", 'Coach must be able to record a renewed period');
includes(route, 'renewed_from_id', 'Renewal history must be linked rather than overwritten');
includes(route, 'syncProgrammeLink', 'Package enrolment must preserve structured Programme assignment');
includes(route, 'open_credit_minutes', 'Renewal data must surface Session Credit context');
includes(route, 'never collects or marks payment', 'Renewal action must explicitly remain a non-payment record');
excludes(route, 'stripeService', 'Renewal API must not use Stripe services');
excludes(route, 'createCheckoutSession', 'Renewal API must not start checkout');
excludes(route, 'paymentIntent', 'Renewal API must not create payment intents');
includes(server, "app.use('/renewals', renewalRoutes);", 'Renewal API must be mounted independently');
includes(players, 'current_package', 'Player Register cards must receive current package renewal context');
includes(players, 'package_enrolments', 'Player Register profiles must receive package history');
includes(app, 'path="/renewals"', 'Renewals workspace must be protected by an app route');
includes(sidebar, "href: '/renewals'", 'Renewals workspace must be reachable in primary navigation');
includes(renewalPage, 'Know who needs a conversation next.', 'Renewal page needs a clear coach-facing action hierarchy');
includes(renewalPage, 'Session Credit context', 'Renewal form must show informational Session Credit context');
includes(renewalPage, 'never discounts, offsets, resolves, or changes credit minutes', 'Renewal form must state that Session Credit remains manual');
includes(renewalPage, 'bg-gradient-to-r from-violet-600 to-indigo-600', 'Package action CTA should be visually distinct');
excludes(retention, 'player_package_enrolments', 'Renewal tracking must not alter retention queries');

console.log('renewals and package tracking checks: PASS');
