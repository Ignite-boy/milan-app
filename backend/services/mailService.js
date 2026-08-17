'use strict';

/**
 * MILAN Mail Service
 * -------------------
 * Sends ALL transactional email from support@milanlife.in:
 *   • Welcome / account-created
 *   • Email verification (confirm address)
 *   • Password reset
 *   • New login / security alert
 *   • Generic test email (admin "send test" button)
 *
 * Provider FAILOVER chain (every configured provider is tried in order; each
 * gets up to 2 retries with backoff on transient errors before we move on):
 *   1. RESEND_API_KEY            -> Resend HTTPS API (recommended on cloud)
 *   2. SENDGRID_API_KEY          -> SendGrid HTTPS API
 *   3. SMTP_HOST + SMTP_USER...  -> Generic SMTP via nodemailer
 *   4. none                      -> logs the mail and returns { ok:false, skipped:true }
 * Each send is time-bounded (MAIL_TIMEOUT_MS, default 12s) so a hung provider
 * can never stall the queue. A small in-memory audit ring powers the admin
 * mail dashboard. Gmail/Yahoo List-Unsubscribe headers ship on non-critical mail.
 *
 * Nothing here ever throws into the auth flow: registration / login must succeed even
 * if mail delivery fails. Callers should `.catch()` and ignore.
 */

const FROM_EMAIL = process.env.MAIL_FROM || 'MILAN <support@milanlife.in>';
const FROM_ADDRESS = process.env.MAIL_FROM_ADDRESS || 'support@milanlife.in';
const REPLY_TO = process.env.MAIL_REPLY_TO || FROM_ADDRESS;
const APP_URL = (process.env.PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL || 'https://milanlife.in').replace(/\/+$/, '');

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/* MILAN brand — indigo→violet, matching the app & landing page. */
const LOGO_URL = `${APP_URL}/assets/icon-192.png`;
const GRAD = 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 55%,#a78bfa 100%)';

/* ──────────────────────────────────────────────────────────────
 * Shared branded shell — premium, logo-led layout so the whole
 * email suite feels like one polished MILAN product. A gradient
 * accent bar + real logo give it an instantly-recognisable identity.
 * ────────────────────────────────────────────────────────────── */
function shell({ preheader = '', heading = '', bodyHtml = '', email = '', accent = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${escapeHtml(heading || 'MILAN')}</title>
</head>
<body style="margin:0;padding:0;background:#07070f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07070f;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0f1120;border:1px solid #23263f;border-radius:22px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.45);">
        <!-- gradient accent bar -->
        <tr><td style="height:5px;background:#6366f1;background-image:${GRAD};font-size:0;line-height:0;">&nbsp;</td></tr>
        <!-- brand header: logo + wordmark -->
        <tr><td style="padding:30px 36px 6px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding-right:12px;">
              <img src="${LOGO_URL}" width="46" height="46" alt="MILAN" style="display:block;border-radius:12px;border:0;outline:none;text-decoration:none;">
            </td>
            <td style="vertical-align:middle;">
              <div style="font-size:20px;font-weight:800;letter-spacing:.14em;color:#eef0ff;line-height:1;">MILAN</div>
              <div style="font-size:12px;color:#8b93bd;margin-top:5px;letter-spacing:.02em;">Your Space. Your People.</div>
            </td>
          </tr></table>
        </td></tr>
        ${accent ? `<tr><td style="padding:20px 36px 0;">
          <div style="display:inline-block;background:rgba(139,92,246,.14);border:1px solid rgba(139,92,246,.4);color:#c9b8ff;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:6px 14px;border-radius:999px;">${accent}</div>
        </td></tr>` : ''}
        ${heading ? `<tr><td style="padding:${accent ? '12' : '18'}px 36px 0;">
          <h1 style="font-size:24px;font-weight:800;color:#f6f7fc;margin:8px 0 4px;line-height:1.3;letter-spacing:-.01em;">${heading}</h1>
        </td></tr>` : ''}
        <tr><td style="padding:10px 36px 8px;">${bodyHtml}</td></tr>
        <tr><td style="padding:26px 36px 32px;">
          <p style="font-size:12px;color:#606b8f;line-height:1.7;margin:0;border-top:1px solid #23263f;padding-top:18px;">
            Sent with 💜 by MILAN · Founder: Nitesh Pandey<br>
            <a href="mailto:${escapeHtml(FROM_ADDRESS)}" style="color:#8b93bd;text-decoration:none;">${escapeHtml(FROM_ADDRESS)}</a> ·
            <a href="${APP_URL}/about" style="color:#8b93bd;text-decoration:none;">About</a> ·
            <a href="${APP_URL}/privacy" style="color:#8b93bd;text-decoration:none;">Privacy</a>
          </p>
        </td></tr>
      </table>
      ${email ? `<div style="max-width:560px;margin-top:16px;font-size:11px;color:#47506e;text-align:center;line-height:1.6;">
        This email was sent to ${escapeHtml(email)} regarding your MILAN account.
      </div>` : ''}
    </td></tr>
  </table>
</body>
</html>`;
}

/* Premium gradient CTA (solid fallback for Outlook, gradient for the rest). */
function button(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#6366f1;background-image:${GRAD};color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:15px 34px;border-radius:12px;box-shadow:0 8px 22px rgba(99,102,241,.4);">${label}</a>`;
}

function codeBox(label, value) {
  return `<div style="background:#080a16;border:1px solid #23263f;border-radius:12px;padding:14px 16px;margin:6px 0;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8b93bd;margin-bottom:6px;">${label}</div>
    <div style="font-family:'SF Mono',Consolas,monospace;font-size:18px;letter-spacing:.18em;color:#b7a6ff;word-break:break-all;line-height:1.6;">${value}</div>
  </div>`;
}

/* A rewarding "perk" list — each row lands like a little unlock. */
function perkList(items) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;">${items.map(([icon, title, sub]) => `
    <tr><td style="padding:9px 0;border-bottom:1px solid #191c30;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:top;width:34px;font-size:19px;line-height:1.4;">${icon}</td>
        <td style="vertical-align:top;">
          <div style="font-size:14px;font-weight:700;color:#eef0ff;line-height:1.4;">${escapeHtml(title)}</div>
          ${sub ? `<div style="font-size:12.5px;color:#8b93bd;line-height:1.5;margin-top:2px;">${escapeHtml(sub)}</div>` : ''}
        </td>
      </tr></table>
    </td></tr>`).join('')}</table>`;
}

/* ── 1) Welcome email — the dopamine moment ───────────────────── */
function welcomeEmail({ name = '', email = '', did = '' } = {}) {
  const safeName = escapeHtml(name || (email ? email.split('@')[0] : 'there'));
  const safeDid = escapeHtml(did || '');
  const subject = `🎉 You're in, ${name || 'welcome'}! Your MILAN space is live`;

  const text = [
    `Hi ${name || 'there'},`, '',
    "🎉 You're in! Welcome to MILAN — the privacy-first decentralized social network where you truly own your data.", '',
    'You are officially a FOUNDING MEMBER. That badge is yours forever.', '',
    'What you just unlocked:',
    '• Your own Decentralized Web Node (DWN) — a personal data vault only you control',
    '• A Decentralized Identifier (DID) — your self-sovereign identity key',
    '• Private by default — no ads, no tracking, no data selling, ever',
    '• Free music, reels, messaging and more',
    did ? `\nYour DID (your identity key):\n${did}\n` : '',
    `Enter MILAN: ${APP_URL}/app`, '',
    'Tip: complete your profile to unlock your full experience.', '',
    'Your Space. Your People.', '— The MILAN Team',
    `Founder: Nitesh Pandey · ${FROM_ADDRESS}`
  ].join('\n');

  const bodyHtml = `
    <p style="font-size:16px;line-height:1.7;color:#c3cae6;margin:0 0 8px;">Welcome aboard, <strong style="color:#eef0ff;">${safeName}</strong> 👋</p>
    <p style="font-size:15px;line-height:1.7;color:#aab2d5;margin:0 0 18px;">You didn't just sign up — you claimed a space on the internet that is <strong style="color:#eef0ff;">genuinely yours</strong>. No landlord. No ads. No one mining your data. 🔐</p>

    <!-- reward: founding member badge -->
    <div style="background:rgba(139,92,246,.10);border:1px solid rgba(139,92,246,.35);border-radius:16px;padding:18px 20px;margin:0 0 22px;text-align:center;">
      <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#c9b8ff;font-weight:700;">🏆 Founding Member</div>
      <div style="font-size:13px;color:#8b93bd;line-height:1.6;margin-top:6px;">You're one of the earliest people on MILAN. This badge is yours forever.</div>
    </div>

    <p style="font-size:14px;font-weight:700;color:#eef0ff;margin:0 0 4px;">Here's everything you just unlocked 👇</p>
    ${perkList([
      ['🔐', 'Your own data vault (DWN)', 'A personal Decentralized Web Node only you control.'],
      ['🪪', 'Self-sovereign identity (DID)', 'Your cryptographic identity key — nobody can take it away.'],
      ['🚫', 'Private by default', 'No ads. No tracking. No data selling. Ever.'],
      ['🎵', 'Free music, reels & messaging', 'A full social experience, on your terms.']
    ])}

    ${safeDid ? `<div style="margin-top:18px;">${codeBox('🗝️ Your identity key (DID)', `<span style="font-size:12px;letter-spacing:0;">${safeDid}</span>`)}</div>` : ''}

    <div style="margin:24px 0 6px;text-align:center;">${button(`${APP_URL}/app`, '🚀 Enter MILAN →')}</div>

    <!-- dopamine loop: next step nudge -->
    <div style="background:#080a16;border:1px dashed #2c3050;border-radius:12px;padding:14px 16px;margin:20px 0 0;">
      <div style="font-size:13px;color:#c3cae6;line-height:1.6;"><strong style="color:#eef0ff;">One quick step:</strong> complete your profile to make your space truly yours — add a photo, a bio, and your first post. It takes 60 seconds. ✨</div>
    </div>`;

  return { subject, text, html: shell({ preheader: `You're in, ${safeName}! You now own your data with DWN + DID. 🎉`, heading: "You're in! 🎉", accent: 'Welcome to MILAN', bodyHtml, email }) };
}

/* ── 2) Email verification ────────────────────────────────────── */
function verifyEmail({ name = '', email = '', verifyUrl = '', code = '' } = {}) {
  const safeName = escapeHtml(name || (email ? email.split('@')[0] : 'there'));
  const subject = 'Confirm your MILAN email address';
  const text = [
    `Hi ${name || 'there'},`, '',
    'Confirm your email address to secure your MILAN account.', '',
    `Verification link:\n${verifyUrl}`, '',
    code ? `Or enter this 6-digit code in the app: ${code}` : '',
    '', 'This link expires in 24 hours. If you did not create a MILAN account, you can ignore this email.',
    '', '— The MILAN Team', `${FROM_ADDRESS}`
  ].filter(Boolean).join('\n');

  const bodyHtml = `
    <p style="font-size:15px;line-height:1.7;color:#aeb9d4;margin:0 0 16px;">Hi <strong style="color:#e8eefb;">${safeName}</strong>, please confirm this is your email address so we can keep your MILAN account secure.</p>
    <div style="margin:18px 0 8px;">${button(verifyUrl, 'Confirm my email →')}</div>
    ${code ? codeBox('Or enter this code', escapeHtml(code)) : ''}
    <p style="font-size:13px;color:#7e8db0;line-height:1.7;margin:16px 0 0;">This link expires in <strong style="color:#aeb9d4;">24 hours</strong>. If the button doesn't work, copy and paste this URL into your browser:</p>
    <p style="font-size:12px;color:#9fc0ff;word-break:break-all;line-height:1.6;margin:6px 0 0;">${escapeHtml(verifyUrl)}</p>
    <p style="font-size:12px;color:#5d6b8c;line-height:1.7;margin:16px 0 0;">If you didn't create a MILAN account, you can safely ignore this email.</p>`;

  return { subject, text, html: shell({ preheader: 'Confirm your email to secure your MILAN account.', heading: 'Confirm your email', bodyHtml, email }) };
}

/* ── 3) Password reset ────────────────────────────────────────── */
function passwordResetEmail({ name = '', email = '', resetUrl = '', code = '' } = {}) {
  const safeName = escapeHtml(name || (email ? email.split('@')[0] : 'there'));
  const subject = 'Reset your MILAN password';
  const text = [
    `Hi ${name || 'there'},`, '',
    'We received a request to reset your MILAN password.', '',
    `Reset link:\n${resetUrl}`, '',
    code ? `Or enter this 6-digit code in the app: ${code}` : '',
    '', 'This link expires in 1 hour. If you did not request a password reset, ignore this email — your password will not change.',
    '', '— The MILAN Team', `${FROM_ADDRESS}`
  ].filter(Boolean).join('\n');

  const bodyHtml = `
    <p style="font-size:15px;line-height:1.7;color:#aeb9d4;margin:0 0 16px;">Hi <strong style="color:#e8eefb;">${safeName}</strong>, we received a request to reset the password for your MILAN account.</p>
    <div style="margin:18px 0 8px;">${button(resetUrl, 'Reset my password →')}</div>
    ${code ? codeBox('Or enter this code', escapeHtml(code)) : ''}
    <p style="font-size:13px;color:#7e8db0;line-height:1.7;margin:16px 0 0;">This link expires in <strong style="color:#aeb9d4;">1 hour</strong>. If the button doesn't work, paste this URL into your browser:</p>
    <p style="font-size:12px;color:#9fc0ff;word-break:break-all;line-height:1.6;margin:6px 0 0;">${escapeHtml(resetUrl)}</p>
    <p style="font-size:12px;color:#5d6b8c;line-height:1.7;margin:16px 0 0;">If you didn't request this, you can ignore this email and your password will stay the same.</p>`;

  return { subject, text, html: shell({ preheader: 'Reset your MILAN password (link expires in 1 hour).', heading: 'Reset your password', bodyHtml, email }) };
}

/* ── 4) New login / security alert ────────────────────────────── */
function loginAlertEmail({ name = '', email = '', ip = '', userAgent = '', time = '', newDevice = false } = {}) {
  const safeName = escapeHtml(name || (email ? email.split('@')[0] : 'there'));
  const when = time || new Date().toUTCString();
  const deviceNote = newDevice
    ? `<div style="display:inline-block;background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.4);color:#fcd34d;font-size:12px;font-weight:700;padding:5px 12px;border-radius:999px;margin:0 0 14px;">🆕 New device or location</div>`
    : '';
  const subject = `Welcome back to MILAN, ${name || 'friend'} 👋`;
  const text = [
    `Hi ${name || 'there'},`, '',
    'Welcome back to MILAN — good to see you again! 👋', '',
    'We noticed a new sign-in to your account. Here are the details for your security:', '',
    `Time: ${when}`,
    `IP address: ${ip || 'unknown'}`,
    `Device: ${userAgent || 'unknown'}`, '',
    "If this was you, you're all set — nothing to do.",
    "If you don't recognise this sign-in, reset your password immediately:",
    `${APP_URL}/reset-password`, '',
    'Your Space. Your People.', '— The MILAN Team', `${FROM_ADDRESS}`
  ].join('\n');

  const bodyHtml = `
    <p style="font-size:16px;line-height:1.7;color:#c3cae6;margin:0 0 8px;">Good to see you again, <strong style="color:#eef0ff;">${safeName}</strong> 👋</p>
    ${deviceNote}
    <p style="font-size:14.5px;line-height:1.7;color:#aab2d5;margin:0 0 18px;">You just signed in to MILAN${newDevice ? ' from a device we haven\'t seen before' : ''}. Here are the details — kept transparent, for your peace of mind. 🛡️</p>
    <div style="background:#080a16;border:1px solid #23263f;border-radius:12px;padding:16px 18px;margin:6px 0 18px;">
      <p style="margin:0 0 8px;font-size:13px;color:#c3cae6;"><span style="color:#8b93bd;">🕐 Time:</span> ${escapeHtml(when)}</p>
      <p style="margin:0 0 8px;font-size:13px;color:#c3cae6;"><span style="color:#8b93bd;">🌐 IP address:</span> ${escapeHtml(ip || 'unknown')}</p>
      <p style="margin:0;font-size:13px;color:#c3cae6;"><span style="color:#8b93bd;">💻 Device:</span> ${escapeHtml(userAgent || 'unknown')}</p>
    </div>
    <p style="font-size:14px;line-height:1.7;color:#aab2d5;margin:0 0 14px;">Was this you? Then you're all set — jump right back in.</p>
    <div style="margin:6px 0 16px;">${button(`${APP_URL}/app`, 'Open MILAN →')}</div>
    <p style="font-size:13px;line-height:1.7;color:#8b93bd;margin:0;border-top:1px solid #23263f;padding-top:16px;">Don't recognise this sign-in? <a href="${APP_URL}/reset-password" style="color:#b7a6ff;text-decoration:none;font-weight:700;">Secure your account →</a></p>`;

  return { subject, text, html: shell({ preheader: `Welcome back, ${safeName} — a new sign-in was detected.`, heading: 'Welcome back 👋', accent: 'Sign-in notice', bodyHtml, email }) };
}

/* ── 5b) Generic event/notification email (automation engine) ──── */
function notificationEmail({ heading = 'MILAN', intro = '', bullets = [], name = '', email = '', ctaText = '', ctaUrl = '' } = {}) {
  const safeName = escapeHtml(name || (email ? email.split('@')[0] : 'there'));
  const ctaFull = ctaUrl ? (/^https?:\/\//.test(ctaUrl) ? ctaUrl : `${APP_URL}${ctaUrl.startsWith('/') ? '' : '/'}${ctaUrl}`) : '';
  const bulletsHtml = (bullets && bullets.length)
    ? `<div style="background:#0d1426;border:1px solid #1e2a44;border-radius:12px;padding:12px 16px;margin:6px 0 12px;">${bullets.map(b => `<p style="margin:0 0 6px;font-size:13px;color:#aeb9d4;">${escapeHtml(b)}</p>`).join('')}</div>`
    : '';
  const bodyHtml = `
    <p style="font-size:15px;line-height:1.7;color:#aeb9d4;margin:0 0 14px;">Hi <strong style="color:#e8eefb;">${safeName}</strong>,</p>
    <p style="font-size:15px;line-height:1.7;color:#aeb9d4;margin:0 0 14px;">${escapeHtml(intro)}</p>
    ${bulletsHtml}
    ${ctaFull ? `<div style="margin:18px 0 8px;">${button(ctaFull, escapeHtml(ctaText || 'Open MILAN →'))}</div>` : ''}`;
  const text = [`Hi ${name || 'there'},`, '', intro, ...(bullets || []), '', ctaFull ? `${ctaText || 'Open'}: ${ctaFull}` : '', '', '— MILAN', FROM_ADDRESS].filter(Boolean).join('\n');
  return { html: shell({ preheader: String(intro).slice(0, 90), heading, bodyHtml, email }), text };
}

/* ── 5) Generic test email (admin) ────────────────────────────── */
function testEmail({ email = '' } = {}) {
  const subject = 'MILAN mail test — delivery is working ✅';
  const text = [
    'This is a MILAN transactional-email test.', '',
    `If you received this, sending from ${FROM_ADDRESS} is configured correctly.`,
    `Time: ${new Date().toUTCString()}`, '', '— MILAN'
  ].join('\n');
  const bodyHtml = `
    <p style="font-size:15px;line-height:1.7;color:#aeb9d4;margin:0 0 16px;">This is a <strong style="color:#e8eefb;">transactional-email test</strong> from MILAN.</p>
    <p style="font-size:15px;line-height:1.7;color:#aeb9d4;margin:0 0 16px;">If you received this message, sending from <strong style="color:#e8eefb;">${escapeHtml(FROM_ADDRESS)}</strong> is configured correctly. 🎉</p>
    <div style="background:#0d1426;border:1px solid #1e2a44;border-radius:12px;padding:14px 16px;">
      <p style="margin:0;font-size:13px;color:#aeb9d4;"><span style="color:#7e8db0;">Sent at:</span> ${escapeHtml(new Date().toUTCString())}</p>
    </div>`;
  return { subject, text, html: shell({ preheader: 'MILAN mail delivery test.', heading: 'Mail delivery test', bodyHtml, email }) };
}

/* ──────────────────────────────────────────────────────────────
 * One-click unsubscribe — Gmail/Yahoo bulk-sender compliance.
 * A signed token (HMAC over the email) lets us honour List-Unsubscribe
 * without exposing an account or needing a login.
 * ────────────────────────────────────────────────────────────── */
const crypto = require('crypto');
function _unsubSecret() {
  return process.env.JWT_SECRET || process.env.MAIL_UNSUB_SECRET || 'milan-mail-unsub';
}
function unsubscribeToken(email) {
  return crypto.createHmac('sha256', _unsubSecret()).update(String(email).toLowerCase()).digest('hex').slice(0, 40);
}
function verifyUnsubscribeToken(email, token) {
  const expected = unsubscribeToken(email);
  const a = Buffer.from(expected), b = Buffer.from(String(token || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function unsubscribeUrl(email) {
  return `${APP_URL}/api/mail/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubscribeToken(email)}`;
}
// Headers Gmail/Yahoo look for on non-critical mail to keep it out of spam.
function listUnsubscribeHeaders(email) {
  if (!email) return {};
  const url = unsubscribeUrl(email);
  return {
    'List-Unsubscribe': `<mailto:${FROM_ADDRESS}?subject=unsubscribe>, <${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
  };
}

/* ──────────────────────────────────────────────────────────────
 * Provider senders (each accepts extra `headers`, each is time-bounded)
 * ────────────────────────────────────────────────────────────── */
const SEND_TIMEOUT_MS = Number(process.env.MAIL_TIMEOUT_MS || 12000);
async function _fetchTimeout(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function sendViaResend({ to, subject, html, text, headers }) {
  const res = await _fetchTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], reply_to: REPLY_TO, subject, html, text, headers: headers || undefined })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.message || data.name || `Resend failed ${res.status}`); e.status = res.status; throw e; }
  return { ok: true, provider: 'resend', id: data.id };
}

async function sendViaSendgrid({ to, subject, html, text, headers }) {
  const res = await _fetchTimeout('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SENDGRID_API_KEY}` },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_ADDRESS, name: 'MILAN' },
      reply_to: { email: REPLY_TO },
      subject,
      headers: headers || undefined,
      content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }]
    })
  });
  if (!res.ok) {
    const data = await res.text().catch(() => '');
    const e = new Error(`SendGrid failed ${res.status}: ${data.slice(0, 160)}`); e.status = res.status; throw e;
  }
  return { ok: true, provider: 'sendgrid' };
}

let _smtpTransport = null;
function getSmtpTransport() {
  if (_smtpTransport) return _smtpTransport;
  let nodemailer;
  try { nodemailer = require('nodemailer'); }
  catch (_) { throw new Error('nodemailer not installed (run `npm i nodemailer`) to use SMTP'); }
  _smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: SEND_TIMEOUT_MS, greetingTimeout: SEND_TIMEOUT_MS, socketTimeout: SEND_TIMEOUT_MS
  });
  return _smtpTransport;
}

async function sendViaSmtp({ to, subject, html, text, headers }) {
  const transport = getSmtpTransport();
  const info = await transport.sendMail({ from: FROM_EMAIL, to, replyTo: REPLY_TO, subject, html, text, headers: headers || undefined });
  return { ok: true, provider: 'smtp', id: info.messageId };
}

/* Ordered list of CONFIGURED providers, so we can fail over between them. */
function providerChain() {
  const chain = [];
  if (process.env.RESEND_API_KEY) chain.push(['resend', sendViaResend]);
  if (process.env.SENDGRID_API_KEY) chain.push(['sendgrid', sendViaSendgrid]);
  if (process.env.SMTP_HOST && process.env.SMTP_USER) chain.push(['smtp', sendViaSmtp]);
  return chain;
}

/* ──────────────────────────────────────────────────────────────
 * Public API
 * ────────────────────────────────────────────────────────────── */
function activeProvider() {
  const c = providerChain();
  return c.length ? c[0][0] : null;
}

// Small in-memory audit ring so the admin panel can see recent deliveries
// (and failures) at a glance — no secrets, capped at 60 entries.
const _audit = [];
function _record(entry) { _audit.unshift({ at: new Date().toISOString(), ...entry }); if (_audit.length > 60) _audit.pop(); }
function mailAudit() { return _audit.slice(0, 40); }

/** Returns provider config status WITHOUT exposing any secret. */
function mailStatus() {
  const chain = providerChain().map(c => c[0]);
  const recent = _audit.slice(0, 20);
  const sent = recent.filter(e => e.ok).length;
  return {
    configured: chain.length > 0,
    provider: chain[0] || 'none',
    providerChain: chain,          // full failover order
    from: FROM_EMAIL,
    fromAddress: FROM_ADDRESS,
    replyTo: REPLY_TO,
    appUrl: APP_URL,
    loginAlerts: String(process.env.MAIL_LOGIN_ALERTS || 'true') !== 'false',
    newDeviceAlertsOnly: String(process.env.MAIL_LOGIN_ALERTS_NEW_DEVICE_ONLY || 'true') !== 'false',
    requireVerification: String(process.env.MAIL_REQUIRE_VERIFICATION || 'false') === 'true',
    recentDelivered: sent,
    recentTotal: recent.length,
    smtp: chain[0] === 'smtp' ? { host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: String(process.env.SMTP_SECURE || '') === 'true', user: process.env.SMTP_USER } : undefined
  };
}

// Provider rate-limit guard (e.g. Resend allows ~2 requests/sec). We serialize all
// sends with a minimum ~600ms gap so welcome + verification + alerts never trip it.
let _mailChain = Promise.resolve();
let _mailLast = 0;
function _throttle() {
  _mailChain = _mailChain.then(async () => {
    const wait = Math.max(0, 600 - (Date.now() - _mailLast));
    if (wait) await new Promise(r => setTimeout(r, wait));
    _mailLast = Date.now();
  });
  return _mailChain;
}

const _sleep = ms => new Promise(r => setTimeout(r, ms));
// A failure worth retrying (network/timeout/5xx/429) vs a permanent one (4xx).
function _transient(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  const s = err.status;
  if (s && s !== 429 && s < 500) return false;   // 4xx (except 429) = permanent
  return true;
}

/**
 * Resilient send: for each configured provider, try with up to 2 retries
 * (exponential backoff) on transient errors; if a provider is exhausted,
 * fail over to the next one. Only gives up when every provider has failed.
 * Never throws — auth/registration flows depend on that.
 */
async function sendMail({ to, subject, html, text, headers, category = 'transactional' } = {}) {
  if (!to) return { ok: false, skipped: true, reason: 'no recipient' };
  const chain = providerChain();
  if (!chain.length) {
    console.log(`[MILAN mail] No provider configured. Would send "${subject}" to ${to} from ${FROM_ADDRESS}.`);
    _record({ to, subject, ok: false, skipped: true, reason: 'no provider' });
    return { ok: false, skipped: true, reason: 'no provider configured' };
  }
  await _throttle();
  const errors = [];
  for (const [name, fn] of chain) {
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const r = await fn({ to, subject, html, text, headers });
        _record({ to, subject, ok: true, provider: name, attempt, category });
        if (attempt > 0 || errors.length) console.log(`[MILAN mail] "${subject}" -> ${to} via ${name} (attempt ${attempt + 1})`);
        return r;
      } catch (err) {
        errors.push(`${name}#${attempt + 1}: ${err.message}`);
        if (attempt < 2 && _transient(err)) { await _sleep(400 * Math.pow(2, attempt)); continue; }
        break; // permanent error, or retries exhausted -> next provider
      }
    }
  }
  console.warn(`[MILAN mail] all providers failed for "${subject}" -> ${to}: ${errors.join(' | ')}`);
  _record({ to, subject, ok: false, error: errors.join(' | ').slice(0, 200), category });
  return { ok: false, error: errors.join(' | ') };
}

const sendWelcomeEmail = ({ to, name, did } = {}) => { const t = welcomeEmail({ name, email: to, did }); return sendMail({ to, ...t, headers: listUnsubscribeHeaders(to), category: 'welcome' }); };
const sendVerificationEmail = ({ to, name, verifyUrl, code } = {}) => { const t = verifyEmail({ name, email: to, verifyUrl, code }); return sendMail({ to, ...t, category: 'verify' }); };
const sendPasswordResetEmail = ({ to, name, resetUrl, code } = {}) => { const t = passwordResetEmail({ name, email: to, resetUrl, code }); return sendMail({ to, ...t, category: 'password_reset' }); };
const sendLoginAlertEmail = ({ to, name, ip, userAgent, time, newDevice } = {}) => { const t = loginAlertEmail({ name, email: to, ip, userAgent, time, newDevice }); return sendMail({ to, ...t, category: 'login_alert' }); };
const sendTestEmail = ({ to } = {}) => { const t = testEmail({ email: to }); return sendMail({ to, ...t, category: 'test' }); };

module.exports = {
  sendMail,
  sendWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail, sendLoginAlertEmail, sendTestEmail,
  welcomeEmail, verifyEmail, passwordResetEmail, loginAlertEmail, testEmail, notificationEmail,
  mailStatus, mailAudit, activeProvider, FROM_ADDRESS, FROM_EMAIL,
  unsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl, listUnsubscribeHeaders
};
