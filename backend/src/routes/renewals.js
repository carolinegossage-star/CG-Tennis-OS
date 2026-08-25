const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool, query, cache } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENROLMENT_STATUSES = ['active', 'renewal_due', 'renewed', 'expired', 'cancelled', 'superseded'];

function coachIdFor(req) {
  return req.user.role === 'super_admin' && req.query.coach_id ? req.query.coach_id : req.user.id;
}

function asPositiveInteger(value, label, maximum = 730) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw Object.assign(new Error(`${label} must be a whole number between 1 and ${maximum}`), { code: 'INVALID_RENEWAL' });
  }
  return parsed;
}

function asMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) {
    throw Object.assign(new Error('Price reference must be between 0 and 1,000,000'), { code: 'INVALID_RENEWAL' });
  }
  return Math.round(amount * 100) / 100;
}

function asDate(value, label) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T12:00:00Z`).getTime())) {
    throw Object.assign(new Error(`${label} must be a valid date`), { code: 'INVALID_RENEWAL' });
  }
  return text;
}

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

function addDays(date, days) {
  const base = new Date(`${dateOnly(date)}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function daysUntil(date) {
  const today = new Date();
  const localToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const target = new Date(`${dateOnly(date)}T00:00:00Z`).getTime();
  return Math.round((target - localToday) / 86400000);
}

function packageValues(input) {
  const name = String(input.name || '').trim();
  if (!name) throw Object.assign(new Error('Package name is required'), { code: 'INVALID_RENEWAL' });
  const durationDays = asPositiveInteger(input.duration_days, 'Package duration');
  const sessionsIncluded = input.sessions_included === null || input.sessions_included === undefined || input.sessions_included === ''
    ? null : asPositiveInteger(input.sessions_included, 'Sessions included', 500);
  return {
    name,
    programme_id: input.programme_id || null,
    duration_days: durationDays,
    price_reference: asMoney(input.price_reference),
    sessions_included: sessionsIncluded,
    description: input.description?.trim() || null,
  };
}

async function getOwnedPackage(packageId, coachId, db, { activeOnly = true } = {}) {
  if (!UUID_PATTERN.test(String(packageId || ''))) throw Object.assign(new Error('Choose a package'), { code: 'INVALID_RENEWAL' });
  const packageResult = await db.query(`
    SELECT cp.*, programme.name AS programme_name
    FROM coaching_packages cp
    LEFT JOIN coaching_programmes programme ON programme.id = cp.programme_id
    WHERE cp.id = $1 AND cp.coach_id = $2 ${activeOnly ? 'AND cp.is_active = true' : ''}
  `, [packageId, coachId]);
  if (!packageResult.rows.length) throw Object.assign(new Error('Choose an active package you manage'), { code: 'INVALID_RENEWAL' });
  return packageResult.rows[0];
}

async function getOwnedPlayer(playerId, coachId, db) {
  if (!UUID_PATTERN.test(String(playerId || ''))) throw Object.assign(new Error('Choose a Player Register entry'), { code: 'INVALID_RENEWAL' });
  const player = await db.query('SELECT id, name, is_active FROM players WHERE id = $1 AND coach_id = $2', [playerId, coachId]);
  if (!player.rows.length) throw Object.assign(new Error('Choose a Player Register entry you manage'), { code: 'INVALID_RENEWAL' });
  return player.rows[0];
}

async function validatePackageProgrammeLink(values, coachId, db) {
  if (!values.programme_id) return null;
  const programme = await db.query('SELECT id, name FROM coaching_programmes WHERE id = $1 AND coach_id = $2', [values.programme_id, coachId]);
  if (!programme.rows.length) throw Object.assign(new Error('Package Programme must belong to your coaching account'), { code: 'INVALID_RENEWAL' });
  return programme.rows[0];
}

async function syncProgrammeLink(playerId, coachId, programmeId, db) {
  if (!programmeId) return;
  await db.query(`
    INSERT INTO player_programmes (player_id, programme_id, coach_id, is_active, assigned_at, updated_at)
    VALUES ($1,$2,$3,true,NOW(),NOW())
    ON CONFLICT (player_id, programme_id)
    DO UPDATE SET is_active = true, updated_at = NOW()
  `, [playerId, programmeId, coachId]);
}

function enrolmentSelect(whereClause = '') {
  return `
    SELECT
      ppe.*,
      p.name AS player_name,
      p.is_active AS player_is_active,
      COALESCE(credit.open_credit_minutes, 0)::int AS open_credit_minutes,
      COALESCE(income.total_received, 0)::numeric(12,2) AS total_received,
      CASE
        WHEN ppe.status IN ('renewed', 'cancelled', 'superseded') THEN ppe.status
        WHEN ppe.renewal_date < CURRENT_DATE THEN 'expired'
        WHEN ppe.renewal_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'renewal_due'
        ELSE ppe.status
      END AS computed_status
    FROM player_package_enrolments ppe
    JOIN players p ON p.id = ppe.player_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(sc.credit_minutes) FILTER (WHERE sc.is_resolved = false), 0) AS open_credit_minutes
      FROM session_credits sc WHERE sc.player_id = ppe.player_id AND sc.coach_id = ppe.coach_id
    ) credit ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(ir.amount), 0) AS total_received
      FROM income_records ir WHERE ir.player_id = ppe.player_id AND ir.coach_id = ppe.coach_id
    ) income ON true
    ${whereClause}
  `;
}

// GET /renewals/packages — active and archived package definitions owned by the coach.
router.get('/packages', authenticate, async (req, res) => {
  const coachId = coachIdFor(req);
  const active = req.query.active ?? 'true';
  try {
    const result = await query(`
      SELECT cp.*, programme.name AS programme_name,
        COALESCE(enrolments.active_enrolments, 0)::int AS active_enrolments,
        COALESCE(enrolments.due_in_30_days, 0)::int AS due_in_30_days
      FROM coaching_packages cp
      LEFT JOIN coaching_programmes programme ON programme.id = cp.programme_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE ppe.status IN ('active', 'renewal_due') AND ppe.renewal_date >= CURRENT_DATE) AS active_enrolments,
          COUNT(*) FILTER (WHERE ppe.status IN ('active', 'renewal_due') AND ppe.renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') AS due_in_30_days
        FROM player_package_enrolments ppe WHERE ppe.package_id = cp.id
      ) enrolments ON true
      WHERE cp.coach_id = $1 ${active === 'all' ? '' : 'AND cp.is_active = true'}
      ORDER BY cp.is_active DESC, cp.name
    `, [coachId]);
    res.json({ packages: result.rows });
  } catch (err) {
    logger.error('Get packages error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

// POST /renewals/packages — defines a package; no charge, checkout, or invoice is created.
router.post('/packages', authenticate, authorize('coach', 'academy_director', 'super_admin'), [
  body('name').trim().notEmpty().isLength({ max: 255 }),
], async (req, res) => {
  let client;
  try {
    const values = packageValues(req.body);
    client = await pool.connect();
    await client.query('BEGIN');
    await validatePackageProgrammeLink(values, req.user.id, client);
    const result = await client.query(`
      INSERT INTO coaching_packages (coach_id, programme_id, name, duration_days, price_reference, sessions_included, description)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [req.user.id, values.programme_id, values.name, values.duration_days, values.price_reference, values.sessions_included, values.description]);
    await client.query('COMMIT');
    res.status(201).json({ package: result.rows[0] });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    logger.error('Create package error', { error: err.message });
    res.status(err.code === 'INVALID_RENEWAL' ? 400 : 500).json({ error: err.message || 'Failed to create package' });
  } finally { client?.release(); }
});

// PUT /renewals/packages/:id — changes a package definition only; existing enrolments retain snapshots.
router.put('/packages/:id', authenticate, authorize('coach', 'academy_director', 'super_admin'), async (req, res) => {
  const coachId = coachIdFor(req);
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const existing = await getOwnedPackage(req.params.id, coachId, client, { activeOnly: false });
    const values = packageValues({ ...existing, ...req.body });
    await validatePackageProgrammeLink(values, coachId, client);
    const result = await client.query(`
      UPDATE coaching_packages SET programme_id = $1, name = $2, duration_days = $3, price_reference = $4,
        sessions_included = $5, description = $6, updated_at = NOW()
      WHERE id = $7 AND coach_id = $8 RETURNING *
    `, [values.programme_id, values.name, values.duration_days, values.price_reference, values.sessions_included, values.description, req.params.id, coachId]);
    await client.query('COMMIT');
    res.json({ package: result.rows[0] });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    logger.error('Update package error', { error: err.message });
    res.status(err.code === 'INVALID_RENEWAL' ? 400 : 500).json({ error: err.message || 'Failed to update package' });
  } finally { client?.release(); }
});

// DELETE /renewals/packages/:id — archives a definition; historical enrolment snapshots remain unchanged.
router.delete('/packages/:id', authenticate, authorize('coach', 'academy_director', 'super_admin'), async (req, res) => {
  const coachId = coachIdFor(req);
  try {
    const result = await query('UPDATE coaching_packages SET is_active = false, updated_at = NOW() WHERE id = $1 AND coach_id = $2 AND is_active = true RETURNING *', [req.params.id, coachId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Active package not found' });
    res.json({ message: 'Package archived; historical enrolments are preserved.', package: result.rows[0] });
  } catch (err) {
    logger.error('Archive package error', { error: err.message });
    res.status(500).json({ error: 'Failed to archive package' });
  }
});

// GET /renewals — renewal tracker. Current status is derived from dates for an accurate coach action list.
router.get('/', authenticate, async (req, res) => {
  const coachId = coachIdFor(req);
  const { window = '30', status, player_id } = req.query;
  const parsedWindow = parseInt(window, 10);
  const windowDays = Math.min(Math.max(Number.isNaN(parsedWindow) ? 30 : parsedWindow, 0), 365);
  const filters = ['ppe.coach_id = $1'];
  const params = [coachId];
  if (player_id) { params.push(player_id); filters.push(`ppe.player_id = $${params.length}`); }
  const where = `WHERE ${filters.join(' AND ')}`;
  try {
    const records = await query(`${enrolmentSelect(where)} ORDER BY ppe.renewal_date ASC, p.name ASC`, params);
    const all = records.rows.map(row => ({ ...row, days_until_renewal: daysUntil(row.renewal_date) }));
    const filtered = all.filter(row => {
      if (status && row.computed_status !== status) return false;
      if (windowDays === 0) return true;
      return row.computed_status === 'expired' || (row.days_until_renewal >= 0 && row.days_until_renewal <= windowDays);
    });
    const active = all.filter(row => ['active', 'renewal_due', 'expired'].includes(row.computed_status));
    res.json({
      enrolments: filtered,
      summary: {
        due_next_30_days: active.filter(row => row.days_until_renewal >= 0 && row.days_until_renewal <= 30).length,
        overdue: active.filter(row => row.days_until_renewal < 0).length,
        active_enrolments: active.filter(row => row.computed_status !== 'expired').length,
        open_credit_minutes: active.reduce((total, row) => total + Number(row.open_credit_minutes || 0), 0),
      },
    });
  } catch (err) {
    logger.error('Get renewals error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch renewals' });
  }
});

// POST /renewals/enrolments — links a Player Register record to a package and Programme for a defined period.
router.post('/enrolments', authenticate, authorize('coach', 'academy_director', 'super_admin'), [
  body('player_id').matches(UUID_PATTERN),
  body('package_id').matches(UUID_PATTERN),
], async (req, res) => {
  let client;
  try {
    const startDate = asDate(req.body.start_date, 'Start date');
    client = await pool.connect();
    await client.query('BEGIN');
    const player = await getOwnedPlayer(req.body.player_id, req.user.id, client);
    const pkg = await getOwnedPackage(req.body.package_id, req.user.id, client);
    const renewalDate = req.body.renewal_date ? asDate(req.body.renewal_date, 'Renewal date') : addDays(startDate, pkg.duration_days - 1);
    if (renewalDate < startDate) throw Object.assign(new Error('Renewal date cannot be before the start date'), { code: 'INVALID_RENEWAL' });
    await client.query(`
      UPDATE player_package_enrolments
      SET status = 'superseded', updated_at = NOW()
      WHERE player_id = $1 AND coach_id = $2 AND status IN ('active', 'renewal_due')
    `, [player.id, req.user.id]);
    const result = await client.query(`
      INSERT INTO player_package_enrolments (
        coach_id, player_id, package_id, programme_id, package_name, programme_name,
        duration_days, price_reference, sessions_included, start_date, renewal_date, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    `, [req.user.id, player.id, pkg.id, pkg.programme_id, pkg.name, pkg.programme_name, pkg.duration_days, pkg.price_reference, pkg.sessions_included, startDate, renewalDate, req.body.notes?.trim() || null]);
    await syncProgrammeLink(player.id, req.user.id, pkg.programme_id, client);
    await client.query('COMMIT');
    await cache.del(`player:${player.id}`);
    res.status(201).json({ enrolment: { ...result.rows[0], player_name: player.name, open_credit_minutes: 0 } });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    logger.error('Create package enrolment error', { error: err.message });
    res.status(err.code === 'INVALID_RENEWAL' ? 400 : 500).json({ error: err.message || 'Failed to create enrolment' });
  } finally { client?.release(); }
});

// POST /renewals/enrolments/:id/renew — records a new manual enrolment period; it never collects or marks payment.
router.post('/enrolments/:id/renew', authenticate, authorize('coach', 'academy_director', 'super_admin'), async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const sourceResult = await client.query(`${enrolmentSelect('WHERE ppe.id = $1 AND ppe.coach_id = $2')}`, [req.params.id, req.user.id]);
    if (!sourceResult.rows.length) throw Object.assign(new Error('Renewal enrolment not found'), { code: 'NOT_FOUND' });
    const source = sourceResult.rows[0];
    const pkg = req.body.package_id ? await getOwnedPackage(req.body.package_id, req.user.id, client) : await getOwnedPackage(source.package_id, req.user.id, client, { activeOnly: false });
    const startDate = req.body.start_date ? asDate(req.body.start_date, 'Renewal start date') : addDays(source.renewal_date, 1);
    const renewalDate = req.body.renewal_date ? asDate(req.body.renewal_date, 'Renewal date') : addDays(startDate, pkg.duration_days - 1);
    if (renewalDate < startDate) throw Object.assign(new Error('Renewal date cannot be before the start date'), { code: 'INVALID_RENEWAL' });
    await client.query("UPDATE player_package_enrolments SET status = 'renewed', updated_at = NOW() WHERE id = $1", [source.id]);
    const result = await client.query(`
      INSERT INTO player_package_enrolments (
        coach_id, player_id, package_id, programme_id, package_name, programme_name,
        duration_days, price_reference, sessions_included, start_date, renewal_date, notes, renewed_from_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [req.user.id, source.player_id, pkg.id, pkg.programme_id, pkg.name, pkg.programme_name, pkg.duration_days, pkg.price_reference, pkg.sessions_included, startDate, renewalDate, req.body.notes?.trim() || null, source.id]);
    await syncProgrammeLink(source.player_id, req.user.id, pkg.programme_id, client);
    await client.query('COMMIT');
    await cache.del(`player:${source.player_id}`);
    res.status(201).json({ enrolment: { ...result.rows[0], player_name: source.player_name, open_credit_minutes: source.open_credit_minutes }, message: 'Renewal period recorded. No payment has been created or applied.' });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    logger.error('Renew package enrolment error', { error: err.message });
    res.status(err.code === 'INVALID_RENEWAL' ? 400 : err.code === 'NOT_FOUND' ? 404 : 500).json({ error: err.message || 'Failed to renew package enrolment' });
  } finally { client?.release(); }
});

// PATCH /renewals/enrolments/:id — coach edits dates/notes or manually marks a non-payment lifecycle status.
router.patch('/enrolments/:id', authenticate, authorize('coach', 'academy_director', 'super_admin'), async (req, res) => {
  const coachId = coachIdFor(req);
  const allowed = ['start_date', 'renewal_date', 'notes', 'status'];
  try {
    const current = await query('SELECT * FROM player_package_enrolments WHERE id = $1 AND coach_id = $2', [req.params.id, coachId]);
    if (!current.rows.length) return res.status(404).json({ error: 'Enrolment not found' });
    const merged = { ...current.rows[0], ...req.body };
    const startDate = asDate(merged.start_date, 'Start date');
    const renewalDate = asDate(merged.renewal_date, 'Renewal date');
    if (renewalDate < startDate) throw Object.assign(new Error('Renewal date cannot be before the start date'), { code: 'INVALID_RENEWAL' });
    if (!ENROLMENT_STATUSES.includes(merged.status)) throw Object.assign(new Error('Invalid enrolment status'), { code: 'INVALID_RENEWAL' });
    const updates = [];
    const values = [];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${values.length + 1}`);
        values.push(field === 'start_date' ? startDate : field === 'renewal_date' ? renewalDate : field === 'notes' ? (req.body.notes?.trim() || null) : req.body.status);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No renewal fields to update' });
    values.push(req.params.id, coachId);
    const result = await query(`UPDATE player_package_enrolments SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length - 1} AND coach_id = $${values.length} RETURNING *`, values);
    await cache.del(`player:${current.rows[0].player_id}`);
    res.json({ enrolment: result.rows[0] });
  } catch (err) {
    logger.error('Update package enrolment error', { error: err.message });
    res.status(err.code === 'INVALID_RENEWAL' ? 400 : 500).json({ error: err.message || 'Failed to update enrolment' });
  }
});

module.exports = router;
