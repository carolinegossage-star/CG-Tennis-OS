const { query } = require('../config/database');
const logger = require('../utils/logger');

// This only updates nullable matching fields on quiz_leads. It does not alter
// the users table or trigger any account, email, or product behaviour.
async function matchExistingQuizLeadAccounts() {
  const result = await query(
    `UPDATE quiz_leads AS lead
     SET matched_user_id = user_account.id,
         matched_at = NOW()
     FROM users AS user_account
     WHERE lead.matched_user_id IS NULL
       AND LOWER(lead.email) = LOWER(user_account.email)
     RETURNING lead.id`
  );

  if (result.rowCount > 0) {
    logger.info('Quiz lead account matches updated', { count: result.rowCount });
  }

  return result.rowCount;
}

module.exports = { matchExistingQuizLeadAccounts };
