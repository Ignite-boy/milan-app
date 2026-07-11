/**
 * MILAN V2 — Milestones API
 * Tracks and announces milestone achievements.
 * GET  /api/v2/milestones/mine       — current user's milestones
 * POST /api/v2/milestones/check      — check if a new milestone was crossed
 */

const express = require('express');
const auth    = require('../../middleware/auth');
const { readJson, writeJson, findUserById } = require('../../utils/store');
const router  = express.Router();
const path    = require('path');

const MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000, 10000];

function msFile() {
  return global.milestonesFile || path.join(require('../../services/cloudDwnRegistry').databaseRoot(), 'v2_milestones.json');
}
function readMs() { return readJson(msFile(), {}); }
function saveMs(d) { writeJson(msFile(), d); }
function users()   { return readJson(global.usersFile, {}); }
const now = () => new Date().toISOString();

// GET /api/v2/milestones/mine
router.get('/mine', auth, (req, res) => {
  try {
    const all = readMs();
    const ms  = all[req.userId] || { achieved: [], pending: [] };
    res.json(ms);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/v2/milestones/check
// body: { metric: 'connections'|'posts'|'reactions', value: number }
router.post('/check', auth, (req, res) => {
  try {
    const { metric, value } = req.body || {};
    if (!metric || value == null) return res.status(400).json({ error: 'metric and value required' });

    const all  = readMs();
    const uid  = req.userId;
    if (!all[uid]) all[uid] = { userId: uid, achieved: [] };

    const ms       = all[uid];
    const achieved = ms.achieved || [];

    // Find the highest milestone crossed
    const crossed = MILESTONES.filter(m => Number(value) >= m);
    const newOnes = crossed.filter(m => !achieved.find(a => a.metric === metric && a.value === m));

    newOnes.forEach(m => {
      achieved.push({ metric, value: m, crossedAt: now() });
    });
    ms.achieved = achieved;
    saveMs(all);

    res.json({
      newMilestones: newOnes,
      allAchieved:   achieved.filter(a => a.metric === metric),
      celebrate:     newOnes.length > 0
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
