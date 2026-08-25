const http = require('http');
const jwt = require('./backend/node_modules/jsonwebtoken');

const BASE_URL = process.env.MANUAL_INCOME_API_URL || 'http://127.0.0.1:3104';
const JWT_SECRET = process.env.JWT_SECRET;
const coachId = '11111111-1111-1111-1111-111111111111';
const playerId = '22222222-2222-2222-2222-222222222222';
const programmeId = '44444444-4444-4444-4444-444444444444';
const today = new Date().toISOString().slice(0, 10);

if (!JWT_SECRET) throw new Error('JWT_SECRET is required for local manual-income verification');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
function request(method, path, body) {
  const payload = body ? JSON.stringify(body) : null;
  const token = jwt.sign({ userId: coachId }, JWT_SECRET, { expiresIn: '10m' });
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE_URL}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) } }, response => {
      let raw = '';
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => {
        let data;
        try { data = raw ? JSON.parse(raw) : {}; } catch { return reject(new Error(`${method} ${path} returned non-JSON`)); }
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`${method} ${path} failed (${response.statusCode}): ${JSON.stringify(data)}`));
        resolve(data);
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const session = await request('POST', '/sessions', {
    player_id: playerId, programme_id: programmeId, session_date: today, duration_minutes: 60,
    session_plan: { notes: 'Manual income isolation test' },
  });
  await request('POST', '/session-credits', {
    player_ids: [playerId], session_id: session.id, planned_duration_minutes: 60,
    actual_duration_minutes: 30, credit_reason: 'weather', note: 'Local test credit context.',
  });
  const beforeIncomePlayer = await request('GET', `/players/${playerId}`);
  assert(Number(beforeIncomePlayer.open_credit_minutes) === 30, 'Test setup must have a 30-minute open Session Credit');
  assert(Number(beforeIncomePlayer.total_sessions) === 0, 'Test setup must not mark attendance complete');

  const created = await request('POST', '/income-records', {
    player_id: playerId, amount: 125, received_date: today,
    received_via: 'bank_transfer', note: 'Half-term programme fee.',
  });
  assert(Number(created.income_record.amount) === 125, 'Manual income record must store amount');
  assert(created.income_record.player_name === 'Alex Attendee', 'Manual income record must link Player Register record');

  const ledger = await request('GET', `/income-records?player_id=${playerId}&from=${today}&to=${today}`);
  assert(Number(ledger.summary.total_amount) === 125, 'Ledger total must include manually recorded income');
  assert(ledger.records.length === 1, 'Ledger must return the created record');
  assert(Number(ledger.records[0].open_credit_minutes) === 30, 'Ledger must surface credit context without applying it');

  const afterIncomePlayer = await request('GET', `/players/${playerId}`);
  assert(Number(afterIncomePlayer.open_credit_minutes) === 30, 'Recording income must not resolve or change Session Credit');
  assert(Number(afterIncomePlayer.total_sessions) === 0, 'Recording income must not change attendance or participation');

  const business = await request('GET', `/business-metrics/${coachId}/dashboard-summary`);
  assert(Number(business.monthly_revenue) === 125, 'Business Dashboard must derive monthly income from manual ledger');

  const updated = await request('PUT', `/income-records/${created.income_record.id}`, {
    player_id: playerId, amount: 140, received_date: today,
    received_via: 'cash', note: 'Corrected received amount.',
  });
  assert(Number(updated.income_record.amount) === 140, 'Coach must be able to correct manual ledger entries');
  const afterCorrection = await request('GET', `/income-records?player_id=${playerId}&from=${today}&to=${today}`);
  assert(Number(afterCorrection.summary.total_amount) === 140, 'Corrected income amount must update ledger total');
  const finalPlayer = await request('GET', `/players/${playerId}`);
  assert(Number(finalPlayer.open_credit_minutes) === 30 && Number(finalPlayer.total_sessions) === 0, 'Income correction must remain isolated from credit and attendance');

  console.log('local manual income workflow: PASS');
  console.log(JSON.stringify({ incomeRecordId: created.income_record.id, incomeTotal: afterCorrection.summary.total_amount, creditMinutes: finalPlayer.open_credit_minutes, attendedSessions: finalPlayer.total_sessions }, null, 2));
})().catch(error => { console.error(`local manual income workflow: FAIL\n${error.stack || error.message}`); process.exit(1); });
