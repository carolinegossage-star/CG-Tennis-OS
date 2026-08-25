const http = require('http');
const jwt = require('./backend/node_modules/jsonwebtoken');

const BASE_URL = process.env.SESSION_CREDIT_API_URL || 'http://127.0.0.1:3103';
const JWT_SECRET = process.env.JWT_SECRET;
const coachId = '11111111-1111-1111-1111-111111111111';
const playerId = '22222222-2222-2222-2222-222222222222';
const programmeId = '44444444-4444-4444-4444-444444444444';

if (!JWT_SECRET) throw new Error('JWT_SECRET is required for local Session Credit verification');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function request(method, path, body) {
  const payload = body ? JSON.stringify(body) : null;
  const token = jwt.sign({ userId: coachId }, JWT_SECRET, { expiresIn: '10m' });
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, response => {
      let raw = '';
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => {
        let data;
        try { data = raw ? JSON.parse(raw) : {}; } catch { return reject(new Error(`${method} ${path} returned non-JSON: ${raw.slice(0, 120)}`)); }
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
    player_id: playerId,
    programme_id: programmeId,
    session_date: '2026-08-25',
    duration_minutes: 60,
    session_plan: { notes: 'Session Credit workflow test' },
  });

  const beforeCredit = await request('GET', `/sessions/${session.id}`);
  assert(beforeCredit.participants.length === 1, 'The test session must have one attendance participant');
  assert(beforeCredit.participants[0].participation_status === 'scheduled', 'Credit test must start with unchanged scheduled attendance');

  const createdCredit = await request('POST', '/session-credits', {
    player_ids: [playerId],
    session_id: session.id,
    planned_duration_minutes: 60,
    actual_duration_minutes: 25,
    credit_reason: 'weather',
    note: 'Rain stopped play after 25 minutes.',
  });
  const credit = createdCredit.credits[0];
  assert(Number(credit.credit_minutes) === 35, 'Shortfall credit must equal planned minus actual minutes');

  const afterCredit = await request('GET', `/sessions/${session.id}`);
  assert(afterCredit.participants[0].participation_status === 'scheduled', 'Creating a time credit must not change attendance status');

  const beforeReflectionPlayer = await request('GET', `/players/${playerId}`);
  assert(Number(beforeReflectionPlayer.open_credit_minutes) === 35, 'Player Register must show the open time-credit balance');
  assert(Number(beforeReflectionPlayer.total_sessions) === 0, 'Time credit must not create attended-session activity');

  await request('POST', `/sessions/${session.id}/reflection`, {
    reflection_text: 'Attendance and Session Credit isolation test.',
    participant_attendance: [{ player_id: playerId, participation_status: 'attended' }],
  });
  const afterReflectionPlayer = await request('GET', `/players/${playerId}`);
  assert(Number(afterReflectionPlayer.total_sessions) === 1, 'Attendance should update only after reflection confirmation');
  assert(Number(afterReflectionPlayer.open_credit_minutes) === 35, 'Attendance confirmation must not consume Session Credit');

  const summary = await request('GET', '/session-credits/summary');
  assert(summary.players.some(player => player.player_id === playerId && Number(player.open_credit_minutes) === 35), 'Credit summary must expose the player time balance for future income and renewal views');

  const resolved = await request('PATCH', `/session-credits/${credit.id}/resolve`, { is_resolved: true });
  assert(resolved.credit.is_resolved === true, 'Manual make-up action must resolve the time credit');
  const resolvedPlayer = await request('GET', `/players/${playerId}`);
  assert(Number(resolvedPlayer.open_credit_minutes) === 0, 'Resolved time must leave the attendance history unchanged but clear credit balance');
  assert(Number(resolvedPlayer.total_sessions) === 1, 'Resolving credit must not change completed attendance');

  console.log('local Session Credit workflow: PASS');
  console.log(JSON.stringify({ sessionId: session.id, creditMinutes: credit.credit_minutes, attendanceTotal: resolvedPlayer.total_sessions, remainingCredit: resolvedPlayer.open_credit_minutes }, null, 2));
})().catch(error => {
  console.error(`local Session Credit workflow: FAIL\n${error.stack || error.message}`);
  process.exit(1);
});
