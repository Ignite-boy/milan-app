/**
 * MILAN V2 — Collab PR (Collaboration Pull Request) API
 * Allows creators to invite others to co-author posts.
 * POST /api/v2/collab/request      — send collab invite
 * GET  /api/v2/collab/inbox        — pending collabs for current user
 * POST /api/v2/collab/:id/accept   — accept collab
 * POST /api/v2/collab/:id/reject   — reject collab
 * GET  /api/v2/collab/post/:postId — get collabs for a post
 */

const express  = require('express');
const crypto   = require('crypto');
const auth     = require('../../middleware/auth');
const { readJson, writeJson, findUserById, findUserByDid, addActivity } = require('../../utils/store');
const router   = express.Router();

const uuidv4 = () => crypto.randomUUID();
const now    = () => new Date().toISOString();

function collabFile() { return global.collabFile || require('path').join(require('../../services/cloudDwnRegistry').databaseRoot(), 'v2_collabs.json'); }
function readCollabs() { return readJson(collabFile(), {}); }
function saveCollabs(data) { writeJson(collabFile(), data); }
function users() { return readJson(global.usersFile, {}); }

// POST /api/v2/collab/request
// body: { targetDid, postId?, message?, role? }
router.post('/request', auth, (req, res) => {
  try {
    const { targetDid, postId, message, role } = req.body || {};
    if (!targetDid) return res.status(400).json({ error: 'targetDid required' });

    const me = findUserById(users(), req.userId);
    if (!me?.user) return res.status(401).json({ error: 'Unauthorized' });

    const target = findUserByDid(users(), targetDid);
    if (!target?.user) return res.status(404).json({ error: 'Target user not found' });

    const all = readCollabs();
    const id  = uuidv4();

    all[id] = {
      id,
      type:       'collab_pr',
      fromUserId: req.userId,
      fromDid:    me.user.did,
      fromName:   me.user.profile?.display_name || me.user.email?.split('@')[0] || 'Creator',
      toUserId:   target.user.id,
      toDid:      targetDid,
      postId:     postId || null,
      message:    String(message || '').slice(0, 500),
      role:       role || 'co-author',   // co-author | reviewer | contributor
      status:     'pending',             // pending | accepted | rejected | withdrawn
      createdAt:  now(),
      updatedAt:  now(),
      thread:     []
    };

    saveCollabs(all);

    // Activity notification
    try {
      addActivity(target.user.id, {
        type:    'collab_request',
        actorDid: me.user.did,
        actorName: all[id].fromName,
        collabId: id,
        message: all[id].message,
        postId:  all[id].postId
      });
    } catch (_) {}

    res.json({ success: true, collabId: id, collab: all[id] });
  } catch (e) {
    console.error('[V2 Collab] request error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v2/collab/inbox
router.get('/inbox', auth, (req, res) => {
  try {
    const all    = readCollabs();
    const usrs   = users();
    const me     = findUserById(usrs, req.userId);
    if (!me?.user) return res.status(401).json({ error: 'Unauthorized' });

    const inbox  = Object.values(all).filter(c =>
      c.toUserId === req.userId && c.status === 'pending'
    ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ collabs: inbox, count: inbox.length });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v2/collab/sent
router.get('/sent', auth, (req, res) => {
  try {
    const all  = readCollabs();
    const sent = Object.values(all).filter(c => c.fromUserId === req.userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ collabs: sent, count: sent.length });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/v2/collab/:id/accept
router.post('/:id/accept', auth, (req, res) => {
  try {
    const all  = readCollabs();
    const c    = all[req.params.id];
    if (!c)                         return res.status(404).json({ error: 'Collab not found' });
    if (c.toUserId !== req.userId)  return res.status(403).json({ error: 'Not your collab' });
    if (c.status !== 'pending')     return res.status(400).json({ error: 'Already resolved' });

    c.status    = 'accepted';
    c.updatedAt = now();
    c.thread.push({ by: req.userId, action: 'accepted', at: now(), note: (req.body || {}).note || '' });
    saveCollabs(all);

    // Notify sender
    try {
      const senderUser = findUserById(users(), c.fromUserId);
      const meUser     = findUserById(users(), req.userId);
      if (senderUser?.user) {
        addActivity(c.fromUserId, {
          type:     'collab_accepted',
          actorDid:  meUser?.user?.did,
          actorName: meUser?.user?.profile?.display_name || 'User',
          collabId:  c.id,
          postId:    c.postId
        });
      }
    } catch (_) {}

    res.json({ success: true, collab: c });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/v2/collab/:id/reject
router.post('/:id/reject', auth, (req, res) => {
  try {
    const all = readCollabs();
    const c   = all[req.params.id];
    if (!c)                        return res.status(404).json({ error: 'Collab not found' });
    if (c.toUserId !== req.userId) return res.status(403).json({ error: 'Not your collab' });
    if (c.status !== 'pending')    return res.status(400).json({ error: 'Already resolved' });

    c.status    = 'rejected';
    c.updatedAt = now();
    c.thread.push({ by: req.userId, action: 'rejected', at: now(), reason: (req.body || {}).reason || '' });
    saveCollabs(all);

    res.json({ success: true, collab: c });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v2/collab/post/:postId — who are co-authors of a post
router.get('/post/:postId', auth, (req, res) => {
  try {
    const all    = readCollabs();
    const collabs = Object.values(all).filter(c =>
      c.postId === req.params.postId && c.status === 'accepted'
    );
    res.json({ collabs, count: collabs.length });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/v2/collab/:id/withdraw (sender cancels)
router.post('/:id/withdraw', auth, (req, res) => {
  try {
    const all = readCollabs();
    const c   = all[req.params.id];
    if (!c)                          return res.status(404).json({ error: 'Collab not found' });
    if (c.fromUserId !== req.userId) return res.status(403).json({ error: 'Not your collab' });
    if (c.status !== 'pending')      return res.status(400).json({ error: 'Cannot withdraw — already resolved' });

    c.status    = 'withdrawn';
    c.updatedAt = now();
    saveCollabs(all);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
