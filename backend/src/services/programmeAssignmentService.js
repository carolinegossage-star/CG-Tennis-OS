const { query } = require('../config/database');

function normaliseProgrammeIds(programmeIds) {
  if (programmeIds === undefined || programmeIds === null) return [];
  if (!Array.isArray(programmeIds)) {
    throw Object.assign(new Error('programme_ids must be an array'), { code: 'INVALID_PROGRAMME_ASSIGNMENTS' });
  }
  return [...new Set(programmeIds.filter(Boolean))];
}

async function validateProgrammeIds(programmeIds, coachId, db = { query }) {
  const ids = normaliseProgrammeIds(programmeIds);
  if (!ids.length) return ids;

  const result = await db.query(`
    SELECT id
    FROM coaching_programmes
    WHERE coach_id = $1 AND is_active = true AND id = ANY($2::uuid[])
  `, [coachId, ids]);

  if (result.rows.length !== ids.length) {
    throw Object.assign(new Error('One or more selected Programmes are unavailable'), { code: 'INVALID_PROGRAMME_ASSIGNMENTS' });
  }
  return ids;
}

async function syncPlayerProgrammes({ playerId, coachId, programmeIds, db = { query } }) {
  const ids = await validateProgrammeIds(programmeIds, coachId, db);

  if (!ids.length) {
    await db.query(`
      UPDATE player_programmes
      SET is_active = false, updated_at = NOW()
      WHERE player_id = $1 AND coach_id = $2 AND is_active = true
    `, [playerId, coachId]);
    return [];
  }

  await db.query(`
    UPDATE player_programmes
    SET is_active = false, updated_at = NOW()
    WHERE player_id = $1
      AND coach_id = $2
      AND is_active = true
      AND programme_id <> ALL($3::uuid[])
  `, [playerId, coachId, ids]);

  await db.query(`
    INSERT INTO player_programmes (player_id, programme_id, coach_id, is_active)
    SELECT $1, programme_id, $2, true
    FROM unnest($3::uuid[]) AS programme_id
    ON CONFLICT (player_id, programme_id)
    DO UPDATE SET is_active = true, updated_at = NOW()
  `, [playerId, coachId, ids]);

  return ids;
}

module.exports = { normaliseProgrammeIds, validateProgrammeIds, syncPlayerProgrammes };
