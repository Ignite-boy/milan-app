// ============================================================
// FEATURE 5: Decentralized Autonomous Content Moderation (DAO)
// File: milan-app/backend/services/daoModeration.js
// ============================================================
'use strict';

/**
 * Milan DAO Content Moderation
 *
 * Top trusted users stake tokens to vote on flagged content.
 * Integrates with existing MilanCreatorAccess.sol + MilanTips.sol contracts.
 * Existing Prisma ModerationReport model is used as base.
 *
 * Flow:
 *   1. User flags post → ModerationReport created
 *   2. Trusted stakers (top 100 by reputation) vote APPROVE/REJECT
 *   3. After quorum: post auto-approved or hidden
 *   4. Correct voters earn reputation; incorrect voters lose stake
 */

// In-memory DAO state (production: store in DB + on-chain)
const daoState = {
  proposals:   {},   // proposalId -> Proposal
  stakers:     {},   // userId -> { reputation, stake }
  MIN_STAKE:   100,  // minimum reputation to vote
  QUORUM:      5,    // votes needed to decide
  PASS_RATIO:  0.6,  // 60% APPROVE to pass
};

function getOrCreateStaker(userId) {
  if (!daoState.stakers[userId]) {
    daoState.stakers[userId] = { reputation: 0, stake: 0, votes: [] };
  }
  return daoState.stakers[userId];
}

/**
 * Create a DAO moderation proposal for a flagged post
 * POST /api/dao/propose  { reportId, postId, reporterId, reason }
 */
async function createProposal(req, res) {
  try {
    const { reportId, postId, reporterId, reason } = req.body || {};
    if (!postId || !reporterId) return res.status(400).json({ error: 'postId and reporterId required' });

    const proposalId = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    daoState.proposals[proposalId] = {
      proposalId,
      reportId:   reportId || null,
      postId,
      reporterId,
      reason:     reason || 'Community flag',
      votes:      { APPROVE: [], REJECT: [] }, // APPROVE = keep post, REJECT = remove
      status:     'PENDING', // PENDING | APPROVED | REJECTED | EXPIRED
      createdAt:  Date.now(),
      expiresAt:  Date.now() + 48 * 3600_000, // 48hr window
    };

    res.json({ ok: true, proposalId, message: 'DAO proposal created — trusted stakers can now vote' });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

/**
 * Staker votes on a proposal
 * POST /api/dao/vote  { proposalId, voterId, vote: 'APPROVE'|'REJECT' }
 */
async function castVote(req, res) {
  try {
    const { proposalId, voterId, vote } = req.body || {};
    if (!proposalId || !voterId || !['APPROVE','REJECT'].includes(vote)) {
      return res.status(400).json({ error: 'proposalId, voterId, vote (APPROVE|REJECT) required' });
    }

    const proposal = daoState.proposals[proposalId];
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (proposal.status !== 'PENDING') return res.status(400).json({ error: `Proposal already ${proposal.status}` });
    if (Date.now() > proposal.expiresAt) {
      proposal.status = 'EXPIRED';
      return res.status(400).json({ error: 'Proposal has expired' });
    }

    const staker = getOrCreateStaker(voterId);
    if (staker.reputation < daoState.MIN_STAKE) {
      return res.status(403).json({
        error: `Minimum ${daoState.MIN_STAKE} reputation needed to vote. You have: ${staker.reputation}`,
      });
    }

    // Check already voted
    const alreadyVoted = [...proposal.votes.APPROVE, ...proposal.votes.REJECT].includes(voterId);
    if (alreadyVoted) return res.status(409).json({ error: 'Already voted on this proposal' });

    proposal.votes[vote].push(voterId);
    staker.votes.push({ proposalId, vote, time: Date.now() });

    // Check quorum
    const totalVotes  = proposal.votes.APPROVE.length + proposal.votes.REJECT.length;
    const approveRatio = proposal.votes.APPROVE.length / totalVotes;
    let decided = false;

    if (totalVotes >= daoState.QUORUM) {
      if (approveRatio >= daoState.PASS_RATIO) {
        proposal.status = 'APPROVED'; // Post stays up
        _rewardVoters(proposal.votes.APPROVE, +2);
        _rewardVoters(proposal.votes.REJECT,  -1);
      } else {
        proposal.status = 'REJECTED'; // Post removed
        _rewardVoters(proposal.votes.REJECT,  +2);
        _rewardVoters(proposal.votes.APPROVE, -1);
      }
      decided = true;
    }

    res.json({
      ok: true,
      proposalId,
      votes: { approve: proposal.votes.APPROVE.length, reject: proposal.votes.REJECT.length },
      status:  proposal.status,
      decided,
      message: decided
        ? `Decision reached: ${proposal.status}`
        : `Vote recorded. ${daoState.QUORUM - totalVotes} more vote(s) needed for quorum`,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

function _rewardVoters(voterIds, delta) {
  for (const id of voterIds) {
    const s = getOrCreateStaker(id);
    s.reputation = Math.max(0, s.reputation + delta);
  }
}

/**
 * Add reputation to a user (called after positive on-chain activity)
 * POST /api/dao/reputation  { userId, delta }
 */
async function updateReputation(req, res) {
  try {
    const { userId, delta } = req.body || {};
    if (!userId || delta === undefined) return res.status(400).json({ error: 'userId and delta required' });
    const staker = getOrCreateStaker(userId);
    staker.reputation = Math.max(0, staker.reputation + parseInt(delta));
    res.json({ ok: true, userId, reputation: staker.reputation });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

/**
 * Get proposal details
 * GET /api/dao/proposal/:id
 */
async function getProposal(req, res) {
  try {
    const proposal = daoState.proposals[req.params.id];
    if (!proposal) return res.status(404).json({ error: 'Not found' });
    res.json(proposal);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

/**
 * Get staker reputation
 * GET /api/dao/staker/:userId
 */
async function getStaker(req, res) {
  try {
    const staker = daoState.stakers[req.params.userId] || { reputation: 0, stake: 0, votes: [] };
    res.json({ userId: req.params.userId, ...staker });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

module.exports = { createProposal, castVote, updateReputation, getProposal, getStaker };
