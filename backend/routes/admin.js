const express = require('express');
const fs = require('fs');
const path = require('path');
const { readJson, writeJson, writeJsonAndSync, cleanUsersDb, repairUsersFile } = require('../utils/store');
const dwnStore = require('../services/dwnService');
const { mailStatus, mailAudit, sendTestEmail } = require('../services/mailService');

const router = express.Router();

function adminRequired(req, res, next) {
  const expected = process.env.ADMIN_TOKEN || 'milan-local-admin-token';
  const given = req.headers['x-admin-token'] || req.query.adminToken || req.query.token || '';
  if (String(given) !== String(expected)) return res.status(401).json({ error: 'Admin token required' });
  next();
}
function fileSizeSafe(file) { try { return fs.statSync(file).size; } catch (_) { return 0; } }
function walkSize(dir) {
  let total = 0;
  try {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) total += walkSize(full);
      else total += fileSizeSafe(full);
    }
  } catch (_) {}
  return total;
}
function userRows() {
  repairUsersFile(global.usersFile);
  const users = cleanUsersDb(readJson(global.usersFile, {}));
  return Object.entries(users).filter(([, u]) => u && (u.email || u.did || u.id)).map(([email, u]) => ({
    id: u.id || '', email: u.email || email, did: u.did || '', displayName: u.profile?.display_name || u.name || '',
    dwnEndpoint: u.dwnEndpoint || u.dwn?.endpoint || '', dwnSpaceId: u.dwn?.spaceId || u.settings?.dwnSpaceId || '',
    createdAt: u.created_at || u.createdAt || '', lastLoginAt: u.last_login_at || u.lastLoginAt || '', loginCount: u.login_count || u.loginCount || 0
  }));
}

router.get('/overview', adminRequired, (_req, res) => {
  const users = userRows();
  const status = dwnStore.getStatus();
  const recordsIndex = readJson(status.indexFile, {});
  const records = Object.values(recordsIndex).flatMap(v => Array.isArray(v) ? v : []);
  const requests = Object.values(readJson(global.requestsFile, {})).flatMap(v => Array.isArray(v) ? v : []);
  res.json({
    ok: true,
    app: 'MILAN Admin Overview',
    generatedAt: new Date().toISOString(),
    counts: {
      users: users.length,
      records: records.length,
      privateRecords: records.filter(r => r.accessMode === 'private').length,
      publicRecords: records.filter(r => r.accessMode === 'public').length,
      sharedRecords: records.filter(r => r.accessMode === 'shared_did').length,
      accessRequests: requests.length,
      pendingRequests: requests.filter(r => r.status === 'pending').length
    },
    storage: { ...status, totalBytes: walkSize(status.isolatedUsersDirectory || '') },
    privacy: {
      adminPrivatePayloadVisibility: false,
      oneUserOneDwnSpace: true,
      ownerOnlyByDefault: true,
      explicitDidSharingRequired: true
    }
  });
});

router.get('/users', adminRequired, (_req, res) => res.json({ ok: true, totalUsers: userRows().length, users: userRows() }));

// Delete a user account by email or id (admin only). Purges the central index
// files too, mirroring the user's own self-delete cleanup. Isolated DWN records
// are owner-controlled and removed with the node.
router.post('/users/delete', adminRequired, async (req, res) => {
  try {
    repairUsersFile(global.usersFile);
    const users = cleanUsersDb(readJson(global.usersFile, {}));
    const target = String((req.body && (req.body.email || req.body.id)) || '').trim();
    if (!target) return res.status(400).json({ error: 'email or id is required' });

    // Users are keyed by email — match on the key, the id, or the email field.
    let key = null;
    for (const [email, u] of Object.entries(users)) {
      if (email === target || (u && (u.id === target || u.email === target))) { key = email; break; }
    }
    if (!key) return res.status(404).json({ error: 'User not found: ' + target });

    const removed = users[key];
    const uid = removed && removed.id;
    delete users[key];
    await writeJsonAndSync(global.usersFile, users).catch(() => writeJson(global.usersFile, users));

    if (uid) {
      for (const f of [global.activityFile, global.requestsFile, global.connectionsFile, global.notificationsFile, global.socialReactionsFile, global.socialCommentsFile, global.socialSavesFile]) {
        try { const data = readJson(f, {}); if (data && typeof data === 'object' && data[uid]) { delete data[uid]; writeJson(f, data); } } catch (_) {}
      }
    }
    res.json({ ok: true, deleted: { email: key, id: uid || '', displayName: (removed && (removed.profile?.display_name || removed.name)) || '' } });
  } catch (e) {
    res.status(500).json({ error: 'Delete failed: ' + e.message });
  }
});
router.get('/activity', adminRequired, (_req, res) => res.json(readJson(global.activityFile, {})));
router.get('/feedback', adminRequired, (_req, res) => res.json(readJson(global.feedbackFile, [])));
router.get('/security-reports', adminRequired, (_req, res) => res.json(readJson(global.securityReportsFile, [])));
router.post('/maintenance/compact', adminRequired, (_req, res) => {
  res.json({ ok: true, message: 'Local JSON/DWN compact task acknowledged. Media payloads are already stored outside index files.', at: new Date().toISOString() });
});

/* ── Transactional email: status + test send ─────────────────────── */
// Which provider is configured (no secrets exposed) + verification stats.
router.get('/mail/status', adminRequired, (_req, res) => {
  const users = cleanUsersDb(readJson(global.usersFile, {}));
  const list = Object.values(users).filter(u => u && (u.email || u.id));
  const verified = list.filter(u => u.emailVerified === true).length;
  res.json({ ok: true, mail: mailStatus(), recentMail: mailAudit(), accounts: { total: list.length, verified, unverified: list.length - verified }, at: new Date().toISOString() });
});

// Send a real test email to confirm delivery from support@milanlife.in.
router.post('/mail/test', adminRequired, async (req, res) => {
  const to = String((req.body && req.body.to) || req.query.to || '').trim();
  if (!to || !/^\S+@\S+\.\S+$/.test(to)) return res.status(400).json({ error: 'A valid "to" email is required' });
  const status = mailStatus();
  if (!status.configured) return res.status(400).json({ ok: false, error: 'No mail provider configured. Set RESEND_API_KEY, SENDGRID_API_KEY, or SMTP_* in your environment.', mail: status });
  const result = await sendTestEmail({ to });
  if (!result.ok) return res.status(502).json({ ok: false, error: result.error || result.reason || 'Send failed', provider: status.provider });
  res.json({ ok: true, sentTo: to, provider: result.provider, id: result.id || null, at: new Date().toISOString() });
});

module.exports = router;
