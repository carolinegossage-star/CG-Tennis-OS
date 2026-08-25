const http = require('http');
const jwt = require('./backend/node_modules/jsonwebtoken');

const BASE_URL = process.env.RENEWALS_API_URL || 'http://127.0.0.1:3105';
const JWT_SECRET = process.env.JWT_SECRET;
const coachId = '11111111-1111-1111-1111-111111111111';
const playerId = '22222222-2222-2222-2222-222222222222';
const programmeId = '44444444-4444-4444-4444-444444444444';
if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
function request(method, path, body) {
  const payload = body ? JSON.stringify(body) : null;
  const token = jwt.sign({ userId: coachId }, JWT_SECRET, { expiresIn: '10m' });
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE_URL}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) } }, response => {
      let raw = ''; response.on('data', chunk => { raw += chunk; }); response.on('end', () => { let data; try { data = raw ? JSON.parse(raw) : {}; } catch { return reject(new Error(`${method} ${path} returned non-JSON`)); } if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`${method} ${path} failed (${response.statusCode}): ${JSON.stringify(data)}`)); resolve(data); });
    }); req.on('error', reject); if (payload) req.write(payload); req.end();
  });
}

(async () => {
  const packageData = await request('POST', '/renewals/packages', { name: 'Autumn Group Package', programme_id: programmeId, duration_days: 84, price_reference: 280, sessions_included: 12, description: 'Autumn term group coaching.' });
  const packageId = packageData.package.id;
  assert(packageData.package.price_reference === '280.00' || Number(packageData.package.price_reference) === 280, 'Package must store a private price reference');

  const initial = await request('POST', '/renewals/enrolments', { player_id: playerId, package_id: packageId, start_date: '2026-08-01', notes: 'Initial Player Register package period.' });
  assert(String(initial.enrolment.renewal_date).slice(0, 10) === '2026-10-23', 'Renewal date must derive from 84-day package term');

  const session = await request('POST', '/sessions', { player_id: playerId, programme_id: programmeId, session_date: '2026-08-25', duration_minutes: 60, session_plan: { notes: 'Renewal context session.' } });
  await request('POST', '/session-credits', { player_ids: [playerId], session_id: session.id, planned_duration_minutes: 60, actual_duration_minutes: 40, credit_reason: 'weather', note: 'Context only for renewal.' });

  const tracker = await request('GET', '/renewals?window=0');
  const initialRow = tracker.enrolments.find(item => item.id === initial.enrolment.id);
  assert(initialRow && initialRow.player_name === 'Alex Attendee', 'Renewal tracker must link the Player Register name');
  assert(Number(initialRow.open_credit_minutes) === 20, 'Renewal tracker must show Session Credit as information');
  assert(Number(tracker.summary.active_enrolments) === 1, 'Renewal tracker must count an active period');

  const renewed = await request('POST', `/renewals/enrolments/${initial.enrolment.id}/renew`, { notes: 'Coach confirmed the next package period manually.' });
  assert(renewed.enrolment.renewed_from_id === initial.enrolment.id, 'Renewal must preserve the source-enrolment relationship');
  assert(String(renewed.enrolment.start_date).slice(0, 10) === '2026-10-24', 'Default renewal start must follow the prior period');
  assert(String(renewed.enrolment.renewal_date).slice(0, 10) === '2027-01-15', 'Renewed period must use the package duration');

  const profile = await request('GET', `/players/${playerId}`);
  assert(profile.package_enrolments.length === 2, 'Player Register profile must retain package history');
  assert(profile.package_enrolments.some(item => item.status === 'renewed'), 'Original period must be retained as renewed');
  assert(Number(profile.open_credit_minutes) === 20, 'Renewal must not resolve or alter Session Credit');
  const playerList = await request('GET', '/players?active=all');
  const player = playerList.players.find(item => item.id === playerId);
  assert(player.current_package && player.current_package.package_name === 'Autumn Group Package', 'Player Register card must expose current package context');
  assert((player.programme_ids || []).includes(programmeId), 'Package enrolment must preserve Programme assignment');
  const income = await request('GET', '/income-records?player_id=' + playerId);
  assert(Number(income.summary.total_amount) === 0, 'Renewal tracking must not create manual income entries');

  console.log('local renewals and package workflow: PASS');
  console.log(JSON.stringify({ packageId, originalEnrolmentId: initial.enrolment.id, renewalEnrolmentId: renewed.enrolment.id, renewalDate: renewed.enrolment.renewal_date, creditMinutes: profile.open_credit_minutes, incomeTotal: income.summary.total_amount }, null, 2));
})().catch(error => { console.error(`local renewals and package workflow: FAIL\n${error.stack || error.message}`); process.exit(1); });
