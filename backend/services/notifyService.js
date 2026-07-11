'use strict';

/**
 * MILAN Notification / Email-Automation Engine
 * --------------------------------------------
 * One function — emailEvent(target, type, data) — that fires a branded email
 * from support@milanlife.in whenever a user does something important
 * (friend request, comment, reaction, approval, security change…).
 *
 * • Resolves the recipient by DID or user-id.
 * • Respects the recipient's per-user notification preferences (Settings hub).
 *   Security events (password/2FA) always send.
 * • Fire-and-forget: never throws into the calling route.
 */

const { readJson, findUserById, findUserByDid } = require('../utils/store');
const { sendMail, notificationEmail } = require('./mailService');

// Map event type -> notification preference key. null = always send (security).
const PREF_KEY = {
  comment: 'emailComments',
  reaction: 'emailReactions',
  mention: 'emailMentions',
  friend_request: 'emailFriendRequests',
  friend_request_approved: 'emailFriendRequests',
  access_request: 'emailFriendRequests',
  access_request_approved: 'emailFriendRequests',
  security: null
};

const REACTION_LABEL = { like: '👍 liked', love: '❤️ loved', haha: '😂 laughed at', wow: '😮 reacted to', sad: '😢 reacted to', angry: '😡 reacted to', care: '🤗 cared about' };

// Build subject + email body per event type.
function build(type, d) {
  const actor = d.actorName || 'Someone';
  const title = d.recordTitle ? ` "${String(d.recordTitle).slice(0, 60)}"` : '';
  switch (type) {
    case 'comment':
      return { subject: `${actor} commented on your post`, heading: 'New comment', intro: `${actor} commented on your MILAN post${title}.`, bullets: d.text ? [`"${String(d.text).slice(0, 160)}"`] : [], ctaText: 'View comment →', ctaUrl: '/app' };
    case 'reaction':
      return { subject: `${actor} reacted to your post`, heading: 'New reaction', intro: `${actor} ${REACTION_LABEL[d.reaction] || 'reacted to'} your MILAN post${title}.`, ctaText: 'Open MILAN →', ctaUrl: '/app' };
    case 'friend_request':
    case 'access_request':
      return { subject: `${actor} sent you a request on MILAN`, heading: 'New request', intro: `${actor} wants to connect with you on MILAN${d.message ? ':' : '.'}`, bullets: d.message ? [`"${String(d.message).slice(0, 160)}"`] : [], ctaText: 'Review request →', ctaUrl: '/app' };
    case 'friend_request_approved':
    case 'access_request_approved':
      return { subject: `${actor} accepted your request`, heading: 'Request accepted', intro: `${actor} accepted your request on MILAN. You're now connected.`, ctaText: 'Open MILAN →', ctaUrl: '/app' };
    case 'security':
      return { subject: d.subject || 'MILAN security update', heading: d.heading || 'Security update', intro: d.intro || 'A security-related change was made to your MILAN account.', bullets: d.bullets || [], ctaText: 'Review security →', ctaUrl: '/settings' };
    default:
      return null;
  }
}

function resolveUser(target) {
  if (!target) return null;
  const all = readJson(global.usersFile, {});
  if (typeof target === 'object') return target;            // already a user object
  if (String(target).startsWith('did:')) return findUserByDid(all, target)?.user || null;
  return findUserById(all, target)?.user || null;           // by user id
}

function prefAllows(user, type) {
  const key = PREF_KEY[type];
  if (key === null || key === undefined) return true;       // always-send (security) or unknown
  const prefs = user.settings && user.settings.notifications;
  if (!prefs) return true;                                   // default on
  return prefs[key] !== false;
}

/**
 * Fire an event email. Returns a promise that always resolves (never throws).
 *   emailEvent(ownerDid, 'comment', { actorName, recordTitle, text })
 */
function emailEvent(target, type, data = {}) {
  try {
    const user = resolveUser(target);
    if (!user || !user.email) return Promise.resolve({ ok: false, skipped: 'no recipient' });
    if (user.status === 'deactivated') return Promise.resolve({ ok: false, skipped: 'deactivated' });
    if (!prefAllows(user, type)) return Promise.resolve({ ok: false, skipped: 'opted out' });
    const spec = build(type, data);
    if (!spec) return Promise.resolve({ ok: false, skipped: 'unknown type' });
    const name = user.profile?.display_name || user.email.split('@')[0];
    const { html, text } = notificationEmail({ heading: spec.heading, intro: spec.intro, bullets: spec.bullets, name, email: user.email, ctaText: spec.ctaText, ctaUrl: spec.ctaUrl });
    return sendMail({ to: user.email, subject: spec.subject, html, text })
      .then(r => { if (r && r.ok) console.log(`[MILAN notify] ${type} -> ${user.email} via ${r.provider}`); return r; })
      .catch(err => { console.warn('[MILAN notify] send failed:', err.message); return { ok: false, error: err.message }; });
  } catch (err) {
    console.warn('[MILAN notify] event failed:', err.message);
    return Promise.resolve({ ok: false, error: err.message });
  }
}

// Convenience helper for security events.
function emailSecurity(target, { subject, heading, intro, bullets } = {}) {
  return emailEvent(target, 'security', { subject, heading, intro, bullets });
}

module.exports = { emailEvent, emailSecurity, PREF_KEY };
