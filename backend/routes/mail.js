'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// MILAN Mail — public endpoints (no auth): one-click unsubscribe.
//
// Gmail & Yahoo require bulk/notification mail to carry a working
// List-Unsubscribe + one-click POST. This route honours both:
//   • POST /api/mail/unsubscribe?e=<email>&t=<token>  -> one-click (RFC 8058)
//   • GET  /api/mail/unsubscribe?e=<email>&t=<token>  -> friendly web page
// The token is an HMAC over the email (see mailService.unsubscribeToken), so a
// link can turn OFF a person's non-critical emails without a login — but can
// never be forged, and never touches security mail (verification, password,
// sign-in, 2FA), which always sends.
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const { readJson, writeJson, writeJsonAndSync, cleanUsersDb, repairUsersFile } = require('../utils/store');
const { verifyUnsubscribeToken, mailStatus } = require('../services/mailService');

const router = express.Router();

// The non-critical (marketing/social) preference keys we switch off. Security
// mail is intentionally NOT in this list — it always sends.
const OPTIONAL_KEYS = ['emailFriendRequests', 'emailComments', 'emailReactions', 'emailMentions', 'emailProductUpdates'];

function getUsers() { repairUsersFile(global.usersFile); return cleanUsersDb(readJson(global.usersFile, {})); }
async function saveUsers(users) {
  const r = await writeJsonAndSync(global.usersFile, users).catch(e => ({ ok: false, error: e.message }));
  if (!r || r.ok === false) writeJson(global.usersFile, users);
}

async function applyUnsubscribe(email) {
  const users = getUsers();
  const key = Object.keys(users).find(k => k.toLowerCase() === String(email).toLowerCase());
  if (!key) return false;
  const user = users[key];
  user.settings = user.settings || {};
  const n = { ...(user.settings.notifications || {}) };
  for (const k of OPTIONAL_KEYS) n[k] = false;
  user.settings.notifications = n;
  user.unsubscribedAt = new Date().toISOString();
  users[key] = user;
  await saveUsers(users);
  return true;
}

function page(title, message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · MILAN</title></head>
<body style="margin:0;background:#07070f;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#eef0ff;">
<div style="max-width:520px;margin:60px auto;padding:32px 28px;background:#0f1120;border:1px solid #23263f;border-radius:20px;text-align:center;">
  <div style="height:5px;background:linear-gradient(135deg,#6366f1,#8b5cf6,#a78bfa);border-radius:999px;margin:-8px -8px 22px;"></div>
  <div style="font-size:22px;font-weight:800;letter-spacing:.14em;">MILAN</div>
  <h1 style="font-size:20px;margin:18px 0 10px;">${title}</h1>
  <p style="color:#aab2d5;line-height:1.7;font-size:15px;">${message}</p>
  <a href="https://milanlife.in/settings" style="display:inline-block;margin-top:18px;background:#6366f1;background-image:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:12px;">Manage email preferences</a>
</div></body></html>`;
}

// One-click (RFC 8058): mail clients POST here with no body.
router.post('/unsubscribe', async (req, res) => {
  const email = String(req.query.e || '').trim();
  const token = String(req.query.t || '').trim();
  if (!email || !verifyUnsubscribeToken(email, token)) return res.status(400).json({ ok: false, error: 'Invalid unsubscribe link' });
  await applyUnsubscribe(email);
  res.json({ ok: true, unsubscribed: true });
});

// Human-friendly page when the recipient clicks the link.
router.get('/unsubscribe', async (req, res) => {
  const email = String(req.query.e || '').trim();
  const token = String(req.query.t || '').trim();
  res.type('html');
  if (!email || !verifyUnsubscribeToken(email, token)) {
    return res.status(400).send(page('Link not valid', 'This unsubscribe link is invalid or has expired. You can manage your preferences from your MILAN settings.'));
  }
  const ok = await applyUnsubscribe(email);
  res.send(page(
    ok ? "You're unsubscribed" : 'Preference saved',
    ok
      ? 'You will no longer receive non-essential emails (comments, reactions, mentions, product updates). Important security emails — sign-in alerts, password and account changes — are always delivered to keep your account safe.'
      : 'We could not find that address, but your request has been noted.'
  ));
});

// Lightweight public health so uptime checks can confirm mail is configured.
router.get('/health', (_req, res) => {
  const s = mailStatus();
  res.json({ ok: true, configured: s.configured, provider: s.provider, providerChain: s.providerChain });
});

module.exports = router;
