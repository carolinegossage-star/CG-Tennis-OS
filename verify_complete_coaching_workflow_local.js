const http = require('http');
const jwt = require('./backend/node_modules/jsonwebtoken');

const BASE_URL = process.env.CGT_E2E_API_URL || 'http://127.0.0.1:3106';
const JWT_SECRET = process.env.JWT_SECRET;
const coachId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const jamieId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const morganId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const today = new Date().toISOString().slice(0, 10);

if (!JWT_SECRET) throw new Error('JWT_SECRET is required for the end-to-end workflow test');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const dateOnly = value => String(value).slice(0, 10);
const addDays = (date, days) => { const result = new Date(`${date}T12:00:00Z`); result.setUTCDate(result.getUTCDate() + days); return result.toISOString().slice(0, 10); };

function request(method, route, body) {
  const payload = body ? JSON.stringify(body) : null;
  const token = jwt.sign({ userId: coachId }, JWT_SECRET, { expiresIn: '15m' });
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE_URL}${route}`, {
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
        try { data = raw ? JSON.parse(raw) : {}; } catch { return reject(new Error(`${method} ${route} returned non-JSON (${response.statusCode})`)); }
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`${method} ${route} failed (${response.statusCode}): ${JSON.stringify(data)}`));
        resolve(data);
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const report = { date: today, stages: [] };

  // 1. Programme is a structured, coach-owned entity—not a free-text session tag.
  const programme = await request('POST', '/programmes', {
    name: 'E2E Performance Pair', programme_type: 'pair', days_of_week: [2, 4], start_time: '17:30',
    duration_minutes: 90, location: 'Centre Court', capacity: 2, notes: 'Structured pair performance programme.',
  });
  assert(programme.programme_type === 'pair' && programme.duration_minutes === 90, 'Programme creation must preserve structured scheduling fields');
  report.stages.push({ stage: 'Programme management', programme_id: programme.id, programme_type: programme.programme_type, schedule: { days_of_week: programme.days_of_week, start_time: programme.start_time, duration_minutes: programme.duration_minutes } });

  // 2. A Programme-linked session creates a complete participant roster for a pair.
  const session = await request('POST', '/sessions', {
    player_id: jamieId, participant_ids: [jamieId, morganId], programme_id: programme.id,
    session_date: today, start_time: '17:30', duration_minutes: 90, environment_type: 'club', location: 'Centre Court',
    session_plan: { notes: 'E2E paired technical and match-play session.' }, frameworks_used: ['Match Intelligence'],
  });
  assert(session.is_group_session === true, 'Pair Programme must map to the legacy group-session flag while retaining structured pair type');
  assert(session.participant_ids.length === 2, 'Pair session must retain both Player Register participants');
  report.stages.push({ stage: 'Session logging', session_id: session.id, programme_id: programme.id, participant_count: session.participant_ids.length, is_group_session: session.is_group_session });

  // 3. Attendance is confirmed independently for each participant at reflection time.
  const reflection = await request('POST', `/sessions/${session.id}/reflection`, {
    reflection_text: 'Jamie completed the serving focus; Morgan was excused with a pre-notified school commitment.',
    reflection_checklist: { technical: true, tactical: true }, enjoyment_score: 8, engagement_score: 9,
    participant_attendance: [
      { player_id: jamieId, participation_status: 'attended', attendance_note: 'Completed full session.' },
      { player_id: morganId, participation_status: 'excused', attendance_note: 'Pre-notified absence.' },
    ],
  });
  const attendance = new Map(reflection.participants.map(item => [item.player_id, item.participation_status]));
  assert(attendance.get(jamieId) === 'attended' && attendance.get(morganId) === 'excused', 'Reflection must preserve attended and excused status separately');
  const sessionDetail = await request('GET', `/sessions/${session.id}`);
  assert(sessionDetail.is_completed === true && sessionDetail.attended_count === 1 && sessionDetail.absent_count === 0, 'Completed session metrics must reflect attendance without treating excused as absent');
  report.stages.push({ stage: 'Participation and reflection', completed: sessionDetail.is_completed, attendance: Object.fromEntries(attendance), attended_count: sessionDetail.attended_count, absent_count: sessionDetail.absent_count });

  // 4. A Session Credit is a separate time ledger: it does not change participation or completion.
  const creditResponse = await request('POST', '/session-credits', {
    player_ids: [jamieId], session_id: session.id, planned_duration_minutes: 90, actual_duration_minutes: 60,
    credit_reason: 'weather', note: 'Weather curtailed the final 30 minutes; coach will arrange time manually.',
  });
  const credit = creditResponse.credits[0];
  assert(Number(credit.credit_minutes) === 30, 'Credit must equal planned minus delivered minutes');
  const afterCreditSession = await request('GET', `/sessions/${session.id}`);
  const afterCreditAttendance = new Map(afterCreditSession.participants.map(item => [item.player_id, item.participation_status]));
  assert(afterCreditAttendance.get(jamieId) === 'attended' && afterCreditAttendance.get(morganId) === 'excused', 'Session Credit must not alter attendance statuses');
  const creditSummary = await request('GET', '/session-credits/summary');
  assert(Number(creditSummary.summary.open_credit_minutes) === 30, 'Credit summary must expose a 30-minute open time balance');
  report.stages.push({ stage: 'Session Credit separation', credit_id: credit.id, open_credit_minutes: creditSummary.summary.open_credit_minutes, attendance_unchanged: true });

  // 5. Manual income only records funds already received, while showing—not applying—the open credit balance.
  const income = await request('POST', '/income-records', {
    player_id: jamieId, amount: 360, received_date: today, received_via: 'bank_transfer',
    note: 'Coach manually recorded package payment received; Session Credit remains informational.',
  });
  const incomeLedger = await request('GET', `/income-records?player_id=${jamieId}`);
  assert(Number(incomeLedger.summary.total_amount) === 360 && Number(incomeLedger.records[0].open_credit_minutes) === 30, 'Income ledger must show received amount and separate credit context');
  report.stages.push({ stage: 'Manual income recording', income_record_id: income.income_record.id, recorded_amount: incomeLedger.summary.total_amount, visible_credit_minutes: incomeLedger.records[0].open_credit_minutes });

  // 6. Packages reference Programmes, player enrolments reference packages, and renewals retain history.
  const pkg = await request('POST', '/renewals/packages', {
    name: 'E2E Pair Performance Package', programme_id: programme.id, duration_days: 84,
    price_reference: 360, sessions_included: 12, description: 'Package linked to the E2E pair Programme.',
  });
  const enrolment = await request('POST', '/renewals/enrolments', {
    player_id: jamieId, package_id: pkg.package.id, start_date: today, notes: 'Initial structured Player Register enrolment.',
  });
  const expectedInitialRenewal = addDays(today, 83);
  assert(dateOnly(enrolment.enrolment.renewal_date) === expectedInitialRenewal, 'Initial package renewal date must derive from duration');
  const renewalViewBefore = await request('GET', '/renewals?window=0');
  const firstRenewalRow = renewalViewBefore.enrolments.find(item => item.id === enrolment.enrolment.id);
  assert(firstRenewalRow && Number(firstRenewalRow.open_credit_minutes) === 30, 'Renewal tracker must show Session Credit as context without applying it');
  const renewal = await request('POST', `/renewals/enrolments/${enrolment.enrolment.id}/renew`, {
    notes: 'Coach recorded next period manually after reviewing the credit balance.',
  });
  assert(renewal.enrolment.renewed_from_id === enrolment.enrolment.id, 'Renewal must retain historical lineage');
  assert(dateOnly(renewal.enrolment.start_date) === addDays(expectedInitialRenewal, 1), 'Default renewal starts after prior period ends');
  assert(dateOnly(renewal.enrolment.renewal_date) === addDays(addDays(expectedInitialRenewal, 1), 83), 'Renewed date must derive from package duration');
  const jamie = await request('GET', `/players/${jamieId}`);
  assert(jamie.package_enrolments.length === 2 && Number(jamie.open_credit_minutes) === 30, 'Player Register profile must retain two package periods and the separate credit balance');
  assert(jamie.programme_ids.includes(programme.id), 'Package enrolment must preserve structured Programme assignment in the Player Register');
  report.stages.push({ stage: 'Packages and renewals', package_id: pkg.package.id, package_programme_id: pkg.package.programme_id, initial_renewal_date: dateOnly(enrolment.enrolment.renewal_date), renewal_enrolment_id: renewal.enrolment.id, renewed_start_date: dateOnly(renewal.enrolment.start_date), renewed_end_date: dateOnly(renewal.enrolment.renewal_date), player_history_count: jamie.package_enrolments.length, credit_context_minutes: jamie.open_credit_minutes });

  // 7. Programme analytics and player history reflect the completed session.
  const programmeActivity = await request('GET', '/programmes/analytics/activity');
  assert(Number(programmeActivity.summary.active_programmes) === 1 && Number(programmeActivity.summary.completed_sessions_last_30_days) === 1, 'Programme analytics must include the completed Programme-linked session');
  const jamieSessions = await request('GET', `/sessions?player_id=${jamieId}&completed=true`);
  const morganSessions = await request('GET', `/sessions?player_id=${morganId}&completed=true`);
  assert(jamieSessions.sessions.length === 1 && morganSessions.sessions.length === 1, 'Player session filters must return shared group-session history for each linked player');
  report.stages.push({ stage: 'Activity analytics', active_programmes: programmeActivity.summary.active_programmes, completed_sessions_last_30_days: programmeActivity.summary.completed_sessions_last_30_days, player_history_visible_to_both: true });

  // 8. A coach resolves time owed manually; resolution still does not touch income or attendance.
  const resolved = await request('PATCH', `/session-credits/${credit.id}/resolve`, { is_resolved: true });
  assert(resolved.credit.is_resolved === true, 'Coach must be able to record make-up time manually');
  const finalCreditSummary = await request('GET', '/session-credits/summary');
  const finalIncome = await request('GET', `/income-records?player_id=${jamieId}`);
  const finalSession = await request('GET', `/sessions/${session.id}`);
  assert(Number(finalCreditSummary.summary.open_credit_minutes) === 0, 'Manual credit resolution must clear only the time balance');
  assert(Number(finalIncome.summary.total_amount) === 360, 'Manual credit resolution must not alter recorded income');
  const finalAttendance = new Map(finalSession.participants.map(item => [item.player_id, item.participation_status]));
  assert(finalAttendance.get(jamieId) === 'attended' && finalAttendance.get(morganId) === 'excused', 'Manual credit resolution must not alter attendance');
  report.stages.push({ stage: 'Manual credit resolution', open_credit_minutes: finalCreditSummary.summary.open_credit_minutes, income_unchanged: finalIncome.summary.total_amount, attendance_unchanged: true });

  console.log('complete coaching workflow: PASS');
  console.log(JSON.stringify(report, null, 2));
})().catch(error => {
  console.error(`complete coaching workflow: FAIL\n${error.stack || error.message}`);
  process.exit(1);
});
