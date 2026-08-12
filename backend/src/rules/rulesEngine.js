const { query } = require('../config/database');
const logger = require('../utils/logger');

// ─── Evaluate Rules Against Input ─────────────────────────────────────────────
async function evaluate(input, categories = []) {
  let burnoutRisk = 'low';
  let dropoutRisk = 'low';
  const actions = [];
  const triggeredRules = [];

  try {
    let sql = 'SELECT * FROM rules WHERE is_active = true';
    const params = [];
    if (categories.length) {
      sql += ` AND category = ANY($1::text[])`;
      params.push(categories);
    }
    sql += ' ORDER BY priority ASC';

    const rulesResult = await query(sql, params);

    for (const rule of rulesResult.rows) {
      if (evaluateCondition(rule.conditions, input)) {
        triggeredRules.push(rule.id);
        for (const action of rule.actions) {
          actions.push({ ...action, ruleId: rule.id, ruleVersion: rule.version, ruleName: rule.name });

          // Update risk levels from actions
          if (action.type === 'set_risk_level') {
            if (action.field === 'burnout_risk_level') {
              burnoutRisk = escalateRisk(burnoutRisk, action.value);
            }
            if (action.field === 'dropout_risk_level') {
              dropoutRisk = escalateRisk(dropoutRisk, action.value);
            }
          }
        }
      }
    }

    // Audit log the evaluation
    if (input.player_id) {
      logDecision(input, { burnoutRisk, dropoutRisk, triggeredRules, actions }).catch(e =>
        logger.warn('Audit log failed', { error: e.message })
      );
    }

    return { burnoutRisk, dropoutRisk, actions, triggeredRules };
  } catch (err) {
    logger.error('Rules engine error', { error: err.message });
    return { burnoutRisk: 'low', dropoutRisk: 'low', actions: [], triggeredRules: [] };
  }
}

// ─── Condition Evaluator ──────────────────────────────────────────────────────
function evaluateCondition(conditions, input) {
  if (!conditions || typeof conditions !== 'object') return false;

  // Handle compound conditions: {and: [...], or: [...]}
  if (conditions.and) {
    return conditions.and.every(c => evaluateCondition(c, input));
  }
  if (conditions.or) {
    return conditions.or.some(c => evaluateCondition(c, input));
  }

  const { field, operator, value } = conditions;
  const inputValue = input[field];

  if (inputValue === undefined || inputValue === null) return false;

  switch (operator) {
    case 'eq':  return inputValue === value;
    case 'neq': return inputValue !== value;
    case 'gt':  return parseFloat(inputValue) > parseFloat(value);
    case 'gte': return parseFloat(inputValue) >= parseFloat(value);
    case 'lt':  return parseFloat(inputValue) < parseFloat(value);
    case 'lte': return parseFloat(inputValue) <= parseFloat(value);
    case 'in':  return Array.isArray(value) && value.includes(inputValue);
    case 'contains': return String(inputValue).includes(String(value));
    default: return false;
  }
}

// ─── Risk Level Escalation ────────────────────────────────────────────────────
function escalateRisk(current, proposed) {
  const levels = { low: 0, medium: 1, high: 2, critical: 3 };
  const currentLevel = levels[current] ?? 0;
  const proposedLevel = levels[proposed] ?? 0;
  if (proposedLevel > currentLevel) return proposed;
  return current;
}

// ─── Audit Decision ───────────────────────────────────────────────────────────
async function logDecision(inputs, outputs) {
  await query(`
    INSERT INTO audit_logs (action, resource_type, resource_id, inputs, outputs)
    VALUES ('rules_evaluation', 'player', $1, $2, $3)
  `, [
    inputs.player_id,
    JSON.stringify(inputs),
    JSON.stringify(outputs),
  ]);
}

// ─── Admin: Get all rules ──────────────────────────────────────────────────────
async function getAllRules(category) {
  const params = [];
  let sql = 'SELECT * FROM rules';
  if (category) { sql += ' WHERE category = $1'; params.push(category); }
  sql += ' ORDER BY category, priority ASC';
  const result = await query(sql, params);
  return result.rows;
}

// ─── Admin: Create rule ───────────────────────────────────────────────────────
async function createRule(data) {
  const result = await query(`
    INSERT INTO rules (name, description, category, conditions, actions, priority, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
  `, [
    data.name, data.description, data.category,
    JSON.stringify(data.conditions), JSON.stringify(data.actions),
    data.priority || 100, data.userId
  ]);
  return result.rows[0];
}

module.exports = { evaluate, getAllRules, createRule };
