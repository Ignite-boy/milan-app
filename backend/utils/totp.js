'use strict';

/**
 * Dependency-free TOTP (RFC 6238) + Base32 (RFC 4648) for MILAN 2FA.
 * Compatible with Google Authenticator, Authy, 1Password, etc.
 */

const crypto = require('crypto');
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Random base32 secret (default 20 bytes / 160 bits). */
function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

/** Generate the TOTP code for a given secret at a given time. */
function generate(secret, { step = 30, digits = 6, t = Date.now() } = {}) {
  const counter = Math.floor(t / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(bin % (10 ** digits)).padStart(digits, '0');
}

/** Verify a user-supplied token, allowing ±`window` steps of clock drift. */
function verify(token, secret, { step = 30, digits = 6, window = 1, t = Date.now() } = {}) {
  const clean = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean) || !secret) return false;
  for (let i = -window; i <= window; i++) {
    const candidate = generate(secret, { step, digits, t: t + i * step * 1000 });
    // constant-time-ish compare
    if (candidate.length === clean.length && crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) return true;
  }
  return false;
}

/** otpauth:// URI for QR codes. */
function otpauthURL({ secret, label = 'MILAN', issuer = 'MILAN' }) {
  const l = encodeURIComponent(label), i = encodeURIComponent(issuer);
  return `otpauth://totp/${i}:${l}?secret=${secret}&issuer=${i}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = { generateSecret, generate, verify, otpauthURL, base32Encode, base32Decode };
