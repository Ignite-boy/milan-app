'use strict';

/**
 * Titan/SMTP auth diagnostic.
 *   node scripts/smtp-diagnose.js
 *
 * Loads .env and tries to AUTHENTICATE (transporter.verify) against your SMTP
 * server on the configured port, then also tries the alternate Titan port.
 * Prints the server's raw response so a 535 (bad password) is unambiguous.
 * No email is sent — this only logs in.
 */

require('dotenv').config();
let nodemailer;
try { nodemailer = require('nodemailer'); }
catch (_) { console.error('Run `npm install` first (nodemailer missing).'); process.exit(1); }

const HOST = process.env.SMTP_HOST || 'smtp.titan.email';
const USER = process.env.SMTP_USER || '';
const PASS = process.env.SMTP_PASS || '';

console.log('\n── SMTP diagnostic ───────────────────────────────');
console.log('  host :', HOST);
console.log('  user :', USER);
console.log('  pass :', PASS ? `set (${PASS.length} chars)` : 'MISSING');
console.log('──────────────────────────────────────────────────');

if (!USER || !PASS) { console.error('✖ SMTP_USER / SMTP_PASS not set in .env'); process.exit(1); }

async function tryLogin(port, secure) {
  const t = nodemailer.createTransport({ host: HOST, port, secure, auth: { user: USER, pass: PASS }, connectionTimeout: 12000, greetingTimeout: 12000 });
  process.stdout.write(`→ ${HOST}:${port} secure=${secure} ... `);
  try { await t.verify(); console.log('✓ AUTH OK — these credentials work on this port.'); return true; }
  catch (e) {
    console.log('✗ ' + (e && e.message ? e.message : e));
    if (/535|5\.7\.8|auth/i.test(String(e && e.message))) console.log('   → 535 = username/password rejected by the server (not a network/TLS issue).');
    return false;
  }
}

(async () => {
  const a = await tryLogin(587, false); // STARTTLS (your current setting)
  const b = await tryLogin(465, true);  // SSL (Titan alternate)
  console.log('\nResult:');
  if (a || b) {
    console.log('  ✓ Login succeeded. If 587 failed but 465 worked, set in .env:');
    console.log('      SMTP_PORT=465');
    console.log('      SMTP_SECURE=true');
  } else {
    console.log('  ✖ Both ports rejected the login → the PASSWORD or MAILBOX is the problem, not the code.');
    console.log('    1) Log in to https://app.titan.email as ' + USER + ' with the same password.');
    console.log('    2) If that fails, reset the mailbox password in your hosting/Titan panel and update SMTP_PASS.');
    console.log('    3) If webmail works but this does not, the mailbox may still be activating, or SMTP access is off.');
  }
  process.exit(a || b ? 0 : 2);
})();
