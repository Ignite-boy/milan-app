// ============================================================
// FEATURE 1: Predictive Media Streaming via Markov Chains
// File: milan-app/backend/services/markovStream.js
// ============================================================
'use strict';

/**
 * Markov Chain based prefetch predictor.
 * Tracks user scroll/view patterns and predicts next content CIDs
 * to pre-cache from IPFS/Arweave before user reaches them.
 */

const WINDOW = 5;          // how many items to track in sequence
const TOP_N  = 3;          // how many next items to prefetch
const DECAY  = 0.92;       // older transitions lose weight over time

class MarkovPredictor {
  constructor() {
    // transitions[fromCid][toCid] = weight
    this.transitions = {};
    // per-user recent sequence: userId -> [cid, cid, ...]
    this.userSequence = {};
  }

  /**
   * Record that userId viewed contentCid (call on every feed item view)
   */
  record(userId, contentCid) {
    if (!userId || !contentCid) return;
    if (!this.userSequence[userId]) this.userSequence[userId] = [];
    const seq = this.userSequence[userId];

    if (seq.length > 0) {
      const prev = seq[seq.length - 1];
      if (!this.transitions[prev]) this.transitions[prev] = {};
      this.transitions[prev][contentCid] = (this.transitions[prev][contentCid] || 0) + 1;
    }

    seq.push(contentCid);
    if (seq.length > WINDOW) seq.shift();
  }

  /**
   * Predict next TOP_N content CIDs for a user based on current position
   */
  predict(userId) {
    const seq = this.userSequence[userId];
    if (!seq || seq.length === 0) return [];
    const last = seq[seq.length - 1];
    const nexts = this.transitions[last];
    if (!nexts) return [];
    return Object.entries(nexts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N)
      .map(([cid]) => cid);
  }

  /**
   * Apply time-based decay to transition weights (call periodically)
   */
  decay() {
    for (const from of Object.keys(this.transitions)) {
      for (const to of Object.keys(this.transitions[from])) {
        this.transitions[from][to] *= DECAY;
        if (this.transitions[from][to] < 0.01) {
          delete this.transitions[from][to];
        }
      }
      if (Object.keys(this.transitions[from]).length === 0) {
        delete this.transitions[from];
      }
    }
  }
}

// Singleton
const predictor = new MarkovPredictor();

// Decay every 10 minutes
setInterval(() => predictor.decay(), 10 * 60 * 1000);

/**
 * Express route handler — record a view event
 * POST /api/stream/view  { userId, contentCid, gatewayUrl }
 */
async function recordView(req, res) {
  try {
    const { userId, contentCid, gatewayUrl } = req.body || {};
    if (!userId || !contentCid) return res.status(400).json({ error: 'userId and contentCid required' });
    predictor.record(userId, contentCid);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

/**
 * Express route handler — get prefetch CIDs for a user
 * GET /api/stream/prefetch?userId=xxx
 */
async function getPrefetch(req, res) {
  try {
    const { userId } = req.query || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const cids = predictor.predict(userId);

    // Build gateway URLs using env config
    const gw = process.env.IPFS_GATEWAY_URL || 'https://ipfs.io/ipfs';
    const prefetchUrls = cids.map(cid => ({
      cid,
      url: `${gw}/${cid}`,
      // Also include Arweave fallback if configured
      arweaveUrl: process.env.ARWEAVE_GATEWAY_URL ? `${process.env.ARWEAVE_GATEWAY_URL}/${cid}` : null,
    }));

    res.json({ prefetch: prefetchUrls });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { predictor, recordView, getPrefetch };
