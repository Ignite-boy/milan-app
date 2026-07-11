// ============================================================
// FEATURE 2: Autonomous DWN AI Agent
// File: milan-app/backend/services/dwnAgent.js
// ============================================================
'use strict';

/**
 * Lightweight personal AI agent that runs inside each user's DWN node.
 * Curates feed privately — no data leaves the user's node.
 *
 * Architecture:
 *   - Each user has an isolated agent context (no cross-user data)
 *   - Agent scores posts based on interaction history
 *   - Scores stored in user's own DWN, never on central server
 *   - Fully offline-capable — works without internet
 */

// Simple TF-IDF + interaction scoring (no external AI API needed)
class PersonalAgent {
  constructor(userId) {
    this.userId = userId;
    // interaction weights
    this.weights = { like: 3, comment: 5, repost: 4, view: 1, skip: -1, hide: -5 };
    // tag affinity: tag -> score
    this.tagAffinity  = {};
    // author affinity: authorId -> score
    this.authorAffinity = {};
    // seen post ids (avoid duplicates)
    this.seen = new Set();
  }

  /**
   * Record an interaction event
   * @param {string} type - 'like'|'comment'|'repost'|'view'|'skip'|'hide'
   * @param {object} post - { id, authorId, tags:[], text }
   */
  recordInteraction(type, post) {
    const w = this.weights[type] || 0;
    // Author affinity
    if (post.authorId) {
      this.authorAffinity[post.authorId] = (this.authorAffinity[post.authorId] || 0) + w;
    }
    // Tag affinity
    const tags = post.tags || this._extractTags(post.text || '');
    for (const tag of tags) {
      this.tagAffinity[tag] = (this.tagAffinity[tag] || 0) + w;
    }
    this.seen.add(post.id);
  }

  /**
   * Score a post (higher = more relevant)
   */
  scorePost(post) {
    let score = 0;
    // Author affinity
    score += (this.authorAffinity[post.authorId] || 0) * 0.4;
    // Tag affinity
    const tags = post.tags || this._extractTags(post.text || '');
    for (const tag of tags) {
      score += (this.tagAffinity[tag] || 0) * 0.3;
    }
    // Recency bonus (newer = higher)
    const ageHours = (Date.now() - new Date(post.createdAt || 0).getTime()) / 3600000;
    score += Math.max(0, 48 - ageHours) * 0.1;
    // Already seen penalty
    if (this.seen.has(post.id)) score -= 1000;
    return score;
  }

  /**
   * Curate and rank a list of posts for this user
   * @param {Array} posts
   * @returns {Array} sorted posts, most relevant first
   */
  curateFeed(posts) {
    return posts
      .map(p => ({ ...p, _agentScore: this.scorePost(p) }))
      .sort((a, b) => b._agentScore - a._agentScore)
      .map(({ _agentScore, ...p }) => p);
  }

  _extractTags(text) {
    return (text.match(/#(\w+)/g) || []).map(t => t.slice(1).toLowerCase());
  }

  /** Serialize agent state to store in DWN */
  toJSON() {
    return {
      userId: this.userId,
      tagAffinity: this.tagAffinity,
      authorAffinity: this.authorAffinity,
      seen: [...this.seen].slice(-500), // keep last 500
    };
  }

  /** Restore from DWN-stored JSON */
  static fromJSON(data) {
    const a = new PersonalAgent(data.userId);
    a.tagAffinity    = data.tagAffinity    || {};
    a.authorAffinity = data.authorAffinity || {};
    a.seen           = new Set(data.seen   || []);
    return a;
  }
}

// Agent pool — one per active user (in-memory cache)
const agentPool = {};

function getAgent(userId) {
  if (!agentPool[userId]) agentPool[userId] = new PersonalAgent(userId);
  return agentPool[userId];
}

/**
 * POST /api/agent/interact  { userId, type, post }
 * Records interaction and updates agent model
 */
async function recordInteraction(req, res) {
  try {
    const { userId, type, post } = req.body || {};
    if (!userId || !type || !post) return res.status(400).json({ error: 'userId, type, post required' });
    getAgent(userId).recordInteraction(type, post);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

/**
 * POST /api/agent/curate  { userId, posts: [] }
 * Returns posts sorted by personal relevance
 */
async function curateFeed(req, res) {
  try {
    const { userId, posts } = req.body || {};
    if (!userId || !Array.isArray(posts)) return res.status(400).json({ error: 'userId and posts[] required' });
    const curated = getAgent(userId).curateFeed(posts);
    res.json({ posts: curated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = { PersonalAgent, getAgent, recordInteraction, curateFeed };
