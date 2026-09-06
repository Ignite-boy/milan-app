'use strict';

const express = require('express');
const bcrypt = require('../services/cryptoPool'); // bcrypt off the event loop (worker_threads)
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { generateDIDAndRawSeed, mintRealUserIdentity } = require('../utils/did');
const totp = require('../utils/totp');
const { readJson, writeJson, writeJsonAndSync, addActivity, normalizePulledSnapshot, cleanUsersDb, repairUsersFile } = require('../utils/store');
const { assignDwnEndpoint, ensureUserDwn, getDwnInfo, provisionRemoteUserDwn, pullDatabaseSnapshot } = require('../services/cloudDwnRegistry');
const auth = require('../middleware/auth');
const { sendWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail, sendLoginAlertEmail } = require('../services/mailService');
const { createClient } = require('@supabase/supabase-js');
const supabaseDb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const router = express.Router();

// ── JWT secret — never sign with a public constant ──────────────────
// If JWT_SECRET is set, use it. In production, refuse to start without one
// (a known default key lets anyone forge tokens). In dev, generate an
// ephemeral random secret so we still never sign with a public constant.
const JWT_SECRET = require('../utils/jwtSecret');
const secret = () => JWT_SECRET;
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── Brute-force throttle for sensitive auth endpoints (per IP) ──────
const _authHits = new Map();
function authThrottle(max, windowMs) {
  return (req, res, next) => {
    const ip = clientIp(req);
    const now = Date.now();
    const b = _authHits.get(ip) || { count: 0, reset: now + windowMs };
    if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
    b.count += 1; _authHits.set(ip, b);
    if (b.count > max) {
      const retry = Math.ceil((b.reset - now) / 1000);
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: `Too many attempts. Try again in ${retry}s.` });
    }
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of _authHits) if (now > v.reset) _authHits.delete(k); }, 5 * 60_000).unref?.();

/* ── Email token helpers ───────────────────────────────────────────
 * Tokens are random; only their SHA-256 hash is persisted on the user
 * record, so a leaked users.json never exposes a usable token. Each
 * token carries an expiry and is single-use (cleared after success).
 * ------------------------------------------------------------------ */
const APP_URL = () => (process.env.PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL || 'https://milanlife.in').replace(/\/+$/, '');
const sha256 = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const sixDigit = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
function makeToken() { return crypto.randomBytes(32).toString('hex'); }
function clientIp(req) { return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket?.remoteAddress || 'unknown'; }
function findUserEntryByEmail(users, email) { return users[email] ? [email, users[email]] : null; }
// Constant-time-ish compare of two hex strings.
function safeEqual(a, b) {
  try { const ba = Buffer.from(String(a), 'hex'), bb = Buffer.from(String(b), 'hex'); return ba.length === bb.length && crypto.timingSafeEqual(ba, bb); }
  catch (_) { return false; }
}

async function loadUsersFromDwn() {
  try {
    const pulled = await pullDatabaseSnapshot('users.json');
    const normalized = normalizePulledSnapshot(pulled);
    if (normalized.ok && normalized.data && typeof normalized.data === 'object' && !Array.isArray(normalized.data)) {
      global.__milanHydratingFromDwn = true;
      if (!process.env.VERCEL) {
        writeJson(global.usersFile, cleanUsersDb(normalized.data));
      }
      return cleanUsersDb(normalized.data);
    }
  } catch (err) {
    console.warn('DWN users hydrate failed:', err.message);
  } finally {
    global.__milanHydratingFromDwn = false;
  }
  repairUsersFile(global.usersFile);
  return cleanUsersDb(readJson(global.usersFile, {}));
}

async function loadUsersFromDwnDetailed() {
  try {
    const pulled = await pullDatabaseSnapshot('users.json');
    const normalized = normalizePulledSnapshot(pulled);
    if (normalized.ok && normalized.data && typeof normalized.data === 'object' && !Array.isArray(normalized.data)) {
      global.__milanHydratingFromDwn = true;
      if (!process.env.VERCEL) {
        writeJson(global.usersFile, cleanUsersDb(normalized.data));
      }
      const cleanedUsers = cleanUsersDb(normalized.data);
      return { users: cleanedUsers, fromRemote: true, missing: Object.keys(cleanedUsers).length === 0 };
    }
    repairUsersFile(global.usersFile);
    return { users: cleanUsersDb(readJson(global.usersFile, {})), fromRemote: false, missing: true, error: normalized.error };
  } catch (err) {
    repairUsersFile(global.usersFile);
    return { users: cleanUsersDb(readJson(global.usersFile, {})), fromRemote: false, missing: false, error: err.message };
  } finally {
    global.__milanHydratingFromDwn = false;
  }
}

async function persistUsersAuthoritatively(users) {
  let result;
  if (process.env.VERCEL) {
    const { syncDatabaseSnapshot } = require('../services/cloudDwnRegistry');
    result = await syncDatabaseSnapshot('users.json', users);
  } else {
    result = await writeJsonAndSync(global.usersFile, users);
  }
  if (!result || result.ok === false) {
    let msg = result?.error || 'Production DWN users.json sync failed';
    if (/404|No compatible route|No compatible route accepted/i.test(msg)) msg = 'Production DWN sync failed; verify the configured remote DWN endpoint. Original: ' + msg;
    const err = new Error(msg);
    err.status = 503;
    throw err;
  }
  return result;
}

router.post('/register', authThrottle(10, 60_000), asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const name = String(req.body.name || '').trim();

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters for production use'
    });
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);
  const displayName = name || email.split('@')[0];

  // Mint the user's real cryptographic identity through the DWN engine.
  const identity = await mintRealUserIdentity({
    userId: id,
    email
  });

  const did = identity.did;
  const spaceId = identity.spaceId;
  const identityReal = identity.real;

  // Supabase PostgreSQL is the authoritative account store.
  const { data: existingUser, error: lookupError } = await supabaseDb
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (lookupError) {
    console.error('[auth] Supabase user lookup failed:', lookupError);
    return res.status(500).json({
      error: 'Account database unavailable',
      details: lookupError.message,
      code: lookupError.code
    });
  }

  if (existingUser) {
    return res.status(400).json({ error: 'Email already exists' });
  }

  const { error: insertError } = await supabaseDb
    .from('users')
    .insert({
      id,
      email,
      password_hash: passwordHash,
      name: displayName,
      did,
      space_id: spaceId,
      did_real: identityReal
    });

  if (insertError) {
    console.error('[auth] Supabase users insert failed:', insertError);
    return res.status(500).json({
      error: 'Account database registration failed',
      details: insertError.message,
      code: insertError.code
    });
  }

  console.log('[auth] account created in Supabase:', email, id);

  return res.status(201).json({
    message: 'Registered successfully',
    id,
    email,
    name: displayName,
    did,
    spaceId,
    real: identityReal
  });
}));

router.post('/login', authThrottle(15, 60_000), asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  // Supabase PostgreSQL is the authoritative account store.
  const { data: user, error: lookupError } = await supabaseDb
    .from('users')
    .select('id,email,password_hash,name,did')
    .eq('email', email)
    .maybeSingle();

  if (lookupError) {
    console.error('[auth] Supabase login lookup failed:', lookupError);
    return res.status(500).json({
      error: 'Account database unavailable',
      details: lookupError.message,
      code: lookupError.code
    });
  }

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!user.password_hash) {
    console.error('[auth] User has no password_hash:', email);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);

  if (!passwordOk) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email
    },
    secret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  );

  console.log('[auth] login successful:', email, user.id);

  return res.json({
    token,
    id: user.id,
    email: user.email,
    name: user.name,
    did: user.did,
    profile: {},
    settings: {},
    emailVerified: true,
    twoFactorEnabled: false
  });
}));


router.get('/me', auth, asyncRoute(async (req, res) => {
  const { data: dbUser, error } = await supabaseDb
    .from('users')
    .select('id,email,name,did')
    .eq('id', req.userId)
    .maybeSingle();

  if (error) {
    return res.status(500).json({
      error: 'Account database unavailable',
      details: error.message,
      code: error.code
    });
  }

  if (!dbUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  let avatar = '';
  const recordId = `profile-picture:${dbUser.did}`;

  try {
    const response = await fetch(`${process.env.MINI_DWN_ENDPOINT || 'http://127.0.0.1:3000'}/json-rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now().toString(),
        method: 'dwn.processMessage',
        params: {
          target: dbUser.did,
          message: {
            descriptor: {
              interface: 'Records',
              method: 'Read',
              recordId
            },
            authorization: {
              payload: 'e30',
              signatures: []
            }
          }
        }
      })
    });

    const body = await response.json();
    const reply = body?.result?.reply;

    if (reply?.status?.code === 200 && reply.encodedData) {
      const encoded = String(reply.encodedData)
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(String(reply.encodedData).length / 4) * 4, '=');

      const mime = reply.record?.dataFormat || 'image/jpeg';
      avatar = `data:${mime};base64,${encoded}`;
    }
  } catch (e) {
    console.warn('[auth/me] profile picture restore failed:', e.message);
  }

  return res.json({
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    did: dbUser.did,
    profile: {
      avatar,
      avatarRecordId: recordId
    },
    settings: {},
    emailVerified: true,
    twoFactorEnabled: false
  });
}));

router.post('/verify-email', asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const token = String(req.body.token || '');
  const code = String(req.body.code || '').trim();
  if (!email || (!token && !code)) return res.status(400).json({ error: 'Email and token or code required' });
  const { users } = await loadUsersFromDwnDetailed();
  const entry = findUserEntryByEmail(users, email);
  if (!entry) return res.status(400).json({ error: 'Invalid or expired verification link' });
  const [, user] = entry;
  if (user.emailVerified) return res.json({ ok: true, alreadyVerified: true, message: 'Email already verified' });
  const ev = user.emailVerification;
  if (!ev || !ev.expires || Date.now() > ev.expires) return res.status(400).json({ error: 'Verification link expired. Please request a new one.' });
  const ok = (token && safeEqual(ev.tokenHash, sha256(token))) || (code && safeEqual(ev.codeHash, sha256(code)));
  if (!ok) return res.status(400).json({ error: 'Invalid verification token or code' });
  user.emailVerified = true;
  user.emailVerifiedAt = new Date().toISOString();
  delete user.emailVerification;
  users[email] = user;
  await persistUsersAuthoritatively(users);
  addActivity(user.id, 'auth.email_verified', { email });
  res.json({ ok: true, message: 'Email verified successfully' });
}));

// Re-send a verification email.
router.post('/resend-verification', authThrottle(6, 60_000), asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email required' });
  const { users } = await loadUsersFromDwnDetailed();
  const entry = findUserEntryByEmail(users, email);
  // Do not reveal whether the account exists.
  if (!entry) return res.json({ ok: true, message: 'If that account exists, a verification email has been sent.' });
  const [, user] = entry;
  if (user.emailVerified) return res.json({ ok: true, alreadyVerified: true, message: 'Email already verified' });
  const tokenRaw = makeToken();
  const codeRaw = sixDigit();
  user.emailVerification = { tokenHash: sha256(tokenRaw), codeHash: sha256(codeRaw), expires: Date.now() + 24 * 60 * 60 * 1000 };
  users[email] = user;
  await persistUsersAuthoritatively(users);
  const verifyUrl = `${APP_URL()}/verify-email?token=${tokenRaw}&email=${encodeURIComponent(email)}`;
  sendVerificationEmail({ to: email, name: user.profile?.display_name || email.split('@')[0], verifyUrl, code: codeRaw })
    .catch(err => console.warn('[MILAN mail] resend verification error:', err.message));
  res.json({ ok: true, message: 'If that account exists, a verification email has been sent.' });
}));

/* ── Password reset ────────────────────────────────────────────── */
// Step 1: request a reset link. Always 200 to avoid account enumeration.
router.post('/forgot-password', authThrottle(8, 60_000), asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
  const { users } = await loadUsersFromDwnDetailed();
  const entry = findUserEntryByEmail(users, email);
  if (entry) {
    const [, user] = entry;
    const tokenRaw = makeToken();
    const codeRaw = sixDigit();
    user.passwordReset = { tokenHash: sha256(tokenRaw), codeHash: sha256(codeRaw), expires: Date.now() + 60 * 60 * 1000 };
    users[email] = user;
    await persistUsersAuthoritatively(users);
    addActivity(user.id, 'auth.password_reset_requested', { email });
    const resetUrl = `${APP_URL()}/reset-password?token=${tokenRaw}&email=${encodeURIComponent(email)}`;
    sendPasswordResetEmail({ to: email, name: user.profile?.display_name || email.split('@')[0], resetUrl, code: codeRaw })
      .catch(err => console.warn('[MILAN mail] reset email error:', err.message));
  }
  res.json({ ok: true, message: 'If that account exists, a password-reset email has been sent.' });
}));

// Step 2: set a new password using the link token OR the 6-digit code.
router.post('/reset-password', authThrottle(15, 60_000), asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const token = String(req.body.token || '');
  const code = String(req.body.code || '').trim();
  const password = String(req.body.password || '');
  if (!email || (!token && !code)) return res.status(400).json({ error: 'Email and reset token or code required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const { users } = await loadUsersFromDwnDetailed();
  const entry = findUserEntryByEmail(users, email);
  if (!entry) return res.status(400).json({ error: 'Invalid or expired reset link' });
  const [, user] = entry;
  const pr = user.passwordReset;
  if (!pr || !pr.expires || Date.now() > pr.expires) return res.status(400).json({ error: 'Reset link expired. Please request a new one.' });
  const ok = (token && safeEqual(pr.tokenHash, sha256(token))) || (code && safeEqual(pr.codeHash, sha256(code)));
  if (!ok) return res.status(400).json({ error: 'Invalid reset token or code' });
  user.password_hash = await bcrypt.hash(password, 10);
  delete user.passwordReset;
  user.emailVerified = true; // controlling the inbox proves ownership
  user.passwordChangedAt = new Date().toISOString();
  users[email] = user;
  await persistUsersAuthoritatively(users);
  addActivity(user.id, 'auth.password_reset', { email });
  res.json({ ok: true, message: 'Password updated. You can now sign in with your new password.' });
}));

router.use((err, _req, res, _next) => {
  console.error('Auth route failed:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Auth request failed' });
});

module.exports = router;
