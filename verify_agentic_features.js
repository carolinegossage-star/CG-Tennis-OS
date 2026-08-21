const fs = require('fs');
const path = require('path');
const root = '/home/ubuntu/repo_git';
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const retention = read('backend/src/services/retentionFlagService.js');
const drafts = read('backend/src/services/parentDraftService.js');
const standby = read('backend/src/services/standbyService.js');
const routes = read('backend/src/routes/agenticFeatures.js');
const claimRoutes = read('backend/src/routes/standbyRoutes.js');
const migrations = [6, 7, 8].map(n => read(`backend/scripts/migrate_00${n}_${n === 6 ? 'agentic_features' : n === 7 ? 'parent_drafts' : 'standby_queue'}.sql`));

for (const marker of ['>= 21', 'two consecutive group sessions missed', 'dismissed_until', 'resolved_at']) if (!retention.includes(marker)) throw new Error(`Feature A missing ${marker}`);
for (const marker of ["createCipheriv('aes-256-gcm'", 'purge_at', 'status = \'pending\'', 'approveDraft', 'exportPlayerDrafts']) if (!drafts.includes(marker)) throw new Error(`Feature B missing ${marker}`);
for (const marker of ['FOR UPDATE', 'claimed_at IS NULL', 'BEGIN', 'COMMIT', 'ROLLBACK']) if (!standby.includes(marker)) throw new Error(`Feature E missing ${marker}`);
for (const marker of ['/retention-flags', '/parent-draft', '/session/:id/notify-standby', '/feature-settings']) if (!routes.includes(marker)) throw new Error(`Missing route ${marker}`);
if (!claimRoutes.includes("router.post('/:id/claim'")) throw new Error('Missing atomic claim route');
if (drafts.includes('emailService')) throw new Error('Parent drafts coupled to emailService');
if (routes.includes('sendEmail') || routes.includes('sendParent')) throw new Error('Parent-draft route exposes a send path');
for (const file of ['backend/src/services/emailService.js', 'backend/src/services/trialService.js', 'frontend/public/sw.js']) {
  const status = require('child_process').execFileSync('git', ['-C', root, 'diff', '--numstat', file], { encoding: 'utf8' });
  if (status.trim()) throw new Error(`Protected file modified: ${file}`);
}
for (const sql of migrations) {
  if (!/ADD COLUMN IF NOT EXISTS feature_flags|CREATE TABLE IF NOT EXISTS/.test(sql)) throw new Error('Migration is not additive');
  if (/UPDATE users|DROP TABLE|DROP COLUMN/.test(sql)) throw new Error('Migration mutates protected data');
}
console.log('agentic feature checks: PASS');
