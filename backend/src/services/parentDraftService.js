const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const FEATURE_KEY = 'parent_progress_update_writer';
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function encryptionKey() {
  const raw = process.env.DRAFT_ENCRYPTION_KEY;
  if (!raw) throw new Error('DRAFT_ENCRYPTION_KEY is not configured');
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

function decrypt(row) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), row.iv);
  decipher.setAuthTag(row.auth_tag);
  return Buffer.concat([decipher.update(row.content_encrypted), decipher.final()]).toString('utf8');
}

async function featureEnabled(coachId) {
  const result = await query(
    `SELECT COALESCE(feature_flags ->> $2, 'true') AS enabled
       FROM coach_profiles WHERE user_id = $1`,
    [coachId, FEATURE_KEY]
  );
  return result.rows[0]?.enabled !== 'false';
}

async function getPlayerForCoach(playerId, coachId) {
  const result = await query(
    `SELECT id, coach_id, name, parent_name, parent_email, enjoyment_score,
            engagement_score, notes, milestones
       FROM players WHERE id = $1 AND coach_id = $2 AND is_active = true`,
    [playerId, coachId]
  );
  return result.rows[0] || null;
}

async function createDraft({ coachId, playerId, tags = [], includeRetentionContext = false }) {
  if (!(await featureEnabled(coachId))) throw Object.assign(new Error('Feature disabled'), { code: 'FEATURE_DISABLED' });
  const player = await getPlayerForCoach(playerId, coachId);
  if (!player) throw Object.assign(new Error('Player not found'), { code: 'PLAYER_NOT_FOUND' });

  let retentionContext = null;
  if (includeRetentionContext) {
    const result = await query(
      `SELECT flag_reason, context FROM retention_flags
        WHERE player_id = $1 AND coach_id = $2 AND resolved_at IS NULL
        ORDER BY flagged_at DESC LIMIT 1`,
      [playerId, coachId]
    );
    retentionContext = result.rows[0] || null;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 350,
    system: 'You write warm, concise British-English progress-update drafts for a tennis coach to review and send manually. Write performance and progress content only. Never include safeguarding advice, claims of diagnosis, invented facts, or a send instruction. Return only the message text beginning with Hi.',
    messages: [{
      role: 'user',
      content: JSON.stringify({
        player_name: player.name,
        parent_name: player.parent_name || 'there',
        tags: tags.slice(0, 5),
        notes: player.notes || '',
        milestones: player.milestones || [],
        enjoyment_score: player.enjoyment_score,
        engagement_score: player.engagement_score,
        retention_context: retentionContext,
      }),
    }],
  });
  const content = response.content[0]?.text?.trim();
  if (!content) throw new Error('AI returned an empty draft');
  const encrypted = encrypt(content);

  const saved = await query(
    `INSERT INTO parent_drafts
       (player_id, coach_id, content_encrypted, iv, auth_tag, status, purge_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', NOW() + INTERVAL '30 days')
     RETURNING id, player_id, coach_id, status, created_at, purge_at`,
    [playerId, coachId, encrypted.ciphertext, encrypted.iv, encrypted.authTag]
  );
  await query(
    `INSERT INTO parent_draft_audit_events (draft_id, player_id, coach_id, event_type)
     VALUES ($1, $2, $3, 'created')`,
    [saved.rows[0].id, playerId, coachId]
  );
  return { ...saved.rows[0], content };
}

async function approveDraft(draftId, coachId) {
  const result = await query(
    `UPDATE parent_drafts SET status = 'approved', approved_at = NOW(), purge_at = NULL
      WHERE id = $1 AND coach_id = $2 AND status = 'pending'
      RETURNING id, player_id, coach_id, status, approved_at`,
    [draftId, coachId]
  );
  if (!result.rows.length) return null;
  const draft = result.rows[0];
  await query(
    `INSERT INTO parent_draft_audit_events (draft_id, player_id, coach_id, event_type)
     VALUES ($1, $2, $3, 'approved')`,
    [draft.id, draft.player_id, coachId]
  );
  const withContent = await getDraftContent(draftId, coachId);
  return { ...draft, content: withContent?.content || null };
}

async function getDraftContent(draftId, coachId) {
  const result = await query(
    `SELECT id, player_id, coach_id, content_encrypted, iv, auth_tag, status,
            created_at, approved_at, purge_at
       FROM parent_drafts WHERE id = $1 AND coach_id = $2`,
    [draftId, coachId]
  );
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return { ...row, content: decrypt(row) };
}

async function deleteDraft(draftId, coachId, eventType = 'deleted') {
  const existing = await query(
    `SELECT id, player_id FROM parent_drafts WHERE id = $1 AND coach_id = $2 AND status = 'pending'`,
    [draftId, coachId]
  );
  if (!existing.rows.length) return false;
  const draft = existing.rows[0];
  await query('DELETE FROM parent_drafts WHERE id = $1 AND coach_id = $2 AND status = \'pending\'', [draftId, coachId]);
  await query(
    `INSERT INTO parent_draft_audit_events (draft_id, player_id, coach_id, event_type)
     VALUES ($1, $2, $3, $4)`,
    [draft.id, draft.player_id, coachId, eventType]
  );
  return true;
}

async function purgeExpiredDrafts() {
  const result = await query(
    `SELECT id, player_id, coach_id FROM parent_drafts
      WHERE status = 'pending' AND purge_at <= NOW()`
  );
  for (const draft of result.rows) {
    await query('DELETE FROM parent_drafts WHERE id = $1 AND status = \'pending\'', [draft.id]);
    await query(
      `INSERT INTO parent_draft_audit_events (draft_id, player_id, coach_id, event_type)
       VALUES ($1, $2, $3, 'purged')`,
      [draft.id, draft.player_id, draft.coach_id]
    );
  }
  logger.info('Parent draft purge complete', { purged: result.rows.length });
  return result.rows.length;
}

async function exportPlayerDrafts(playerId, coachId) {
  const result = await query(
    `SELECT id, player_id, status, created_at, approved_at, purge_at,
            content_encrypted, iv, auth_tag
       FROM parent_drafts WHERE player_id = $1 AND coach_id = $2 ORDER BY created_at DESC`,
    [playerId, coachId]
  );
  return result.rows.map(row => ({ ...row, content: decrypt(row), content_encrypted: undefined, iv: undefined, auth_tag: undefined }));
}

module.exports = { FEATURE_KEY, createDraft, approveDraft, getDraftContent, deleteDraft, purgeExpiredDrafts, exportPlayerDrafts };
