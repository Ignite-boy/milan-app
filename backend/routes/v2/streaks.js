/**
 * MILAN V2 — Streaks API
 * Tracks daily interaction streaks between connected users.
 * POST /api/v2/streaks/ping         — record daily activity
 * GET  /api/v2/streaks/mine         — my streak stats
 * GET  /api/v2/streaks/:targetDid   — streak with a specific user
 */

const express = require('express');
const auth    = require('../../middleware/auth');
const { readJson, writeJson, findUserById, findUserByDid } = require('../../utils/store');
const router  = express.Router();
const path    = require('path');

function streakFile() {
  return global.streaksFile || path.join(require('../../services/cloudDwnRegistry').databaseRoot(), 'v2_streaks.json');
}
function readStreaks() { return readJson(streakFile(), {}); }
function saveStreaks(d) { writeJson(streakFile(), d); }
function todayStr()    { return new Date().toISOString().slice(0,10); }
function users()       { return readJson(global.usersFile, {}); }

// POST /api/v2/streaks/ping
// Records that the current user was active today
router.post('/ping', auth, (req, res) => {
  try {
    const all  = readStreaks();
    const uid  = req.userId;
    const today = todayStr();

    if (!all[uid]) all[uid] = { userId: uid, lastActive: null, currentStreak: 0, longestStreak: 0, days: [] };

    const s = all[uid];
    const last = s.lastActive;

    if (last === today) {
      return res.json({ streak: s.currentStreak, alreadyPinged: true });
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    if (last === yesterday) {
      s.currentStreak += 1;
    } else {
      s.currentStreak = 1;
    }

    if (s.currentStreak > s.longestStreak) s.longestStreak = s.currentStreak;
    s.lastActive = today;
    s.days = [...(s.days || []).slice(-364), today];

    saveStreaks(all);
    res.json({ streak: s.currentStreak, longestStreak: s.longestStreak, milestone: [7,30,100,365].includes(s.currentStreak) });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v2/streaks/mine
router.get('/mine', auth, (req, res) => {
  try {
    const all = readStreaks();
    const s   = all[req.userId] || { currentStreak: 0, longestStreak: 0, lastActive: null };
    res.json(s);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/v2/streaks/leaderboard
router.get('/leaderboard', auth, (req, res) => {
  try {
    const all  = readStreaks();
    const usrs = users();
    const rows = Object.values(all)
      .sort((a, b) => (b.currentStreak || 0) - (a.currentStreak || 0))
      .slice(0, 10)
      .map(s => {
        const u = findUserById(usrs, s.userId);
        return {
          name:          u?.user?.profile?.display_name || u?.user?.email?.split('@')[0] || 'User',
          currentStreak: s.currentStreak || 0,
          longestStreak: s.longestStreak || 0
        };
      });
    res.json({ leaderboard: rows });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
