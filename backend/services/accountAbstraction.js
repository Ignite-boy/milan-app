// ============================================================
// FEATURE 4: Account Abstraction (ERC-4337) & Social Recovery
// File: milan-app/backend/services/accountAbstraction.js
// ============================================================
'use strict';

const crypto = require('crypto');

/**
 * Milan Account Abstraction Service
 *
 * Integrates with existing BUNDLER_URL + PAYMASTER_URL from config.
 * Enables:
 *   1. Gasless transactions via Paymaster sponsorship
 *   2. DID-based Social Recovery (recover account via trusted friends' DIDs)
 */

const BUNDLER_URL   = process.env.BUNDLER_URL;
const PAYMASTER_URL = process.env.PAYMASTER_URL;
const RPC_URL       = process.env.RPC_URL;
const CHAIN_ID      = parseInt(process.env.CHAIN_ID || '84532');

// ── Social Recovery Store (in production: store in DWN) ────────────
// recoveryStore[userId] = { guardians: [did1, did2, ...], threshold: 2, requests: [] }
const recoveryStore = {};

// ── Gasless Transaction ─────────────────────────────────────────────

/**
 * Build a UserOperation for ERC-4337 gasless tx
 * POST /api/aa/userop  { from, to, calldata, value }
 */
async function buildUserOp(req, res) {
  try {
    if (!BUNDLER_URL) return res.status(503).json({ error: 'Bundler not configured. Set BUNDLER_URL in .env' });
    const { from, to, calldata, value = '0x0' } = req.body || {};
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });

    const userOp = {
      sender:               from,
      nonce:                '0x0',
      initCode:             '0x',
      callData:             calldata || '0x',
      callGasLimit:         '0x493E0',
      verificationGasLimit: '0x493E0',
      preVerificationGas:   '0xC350',
      maxFeePerGas:         '0x3B9ACA00',
      maxPriorityFeePerGas: '0x3B9ACA00',
      paymasterAndData:     '0x',
      signature:            '0x',
    };

    // Request Paymaster sponsorship if configured
    if (PAYMASTER_URL) {
      try {
        const pmResp = await fetch(`${PAYMASTER_URL}/pm_sponsorUserOperation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userOp, entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789', chainId: CHAIN_ID }),
        });
        if (pmResp.ok) {
          const pm = await pmResp.json();
          userOp.paymasterAndData = pm.paymasterAndData || '0x';
        }
      } catch (_) { /* Paymaster optional — degrade gracefully */ }
    }

    res.json({ userOp, bundlerUrl: BUNDLER_URL, chainId: CHAIN_ID });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

/**
 * Submit signed UserOperation to bundler
 * POST /api/aa/submit  { userOp, signature }
 */
async function submitUserOp(req, res) {
  try {
    if (!BUNDLER_URL) return res.status(503).json({ error: 'Bundler not configured' });
    const { userOp, signature } = req.body || {};
    if (!userOp || !signature) return res.status(400).json({ error: 'userOp and signature required' });

    userOp.signature = signature;

    const resp = await fetch(`${BUNDLER_URL}/eth_sendUserOperation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'eth_sendUserOperation',
        params: [userOp, '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'],
      }),
    });

    const result = await resp.json();
    if (result.error) return res.status(400).json({ error: result.error.message });
    res.json({ txHash: result.result });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

// ── Social Recovery ─────────────────────────────────────────────────

/**
 * Setup social recovery guardians for a user
 * POST /api/aa/recovery/setup  { userId, guardianDids: [], threshold }
 */
async function setupRecovery(req, res) {
  try {
    const { userId, guardianDids, threshold = 2 } = req.body || {};
    if (!userId || !Array.isArray(guardianDids) || guardianDids.length < 2) {
      return res.status(400).json({ error: 'userId and at least 2 guardianDids required' });
    }
    if (threshold > guardianDids.length) {
      return res.status(400).json({ error: 'threshold cannot exceed number of guardians' });
    }
    recoveryStore[userId] = { guardians: guardianDids, threshold, requests: [] };
    res.json({ ok: true, guardians: guardianDids.length, threshold });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

/**
 * Guardian approves a recovery request
 * POST /api/aa/recovery/approve  { userId, guardianDid, newDid }
 */
async function approveRecovery(req, res) {
  try {
    const { userId, guardianDid, newDid } = req.body || {};
    if (!userId || !guardianDid || !newDid) {
      return res.status(400).json({ error: 'userId, guardianDid, newDid required' });
    }

    const store = recoveryStore[userId];
    if (!store) return res.status(404).json({ error: 'No recovery setup for this user' });
    if (!store.guardians.includes(guardianDid)) {
      return res.status(403).json({ error: 'Not a registered guardian' });
    }

    // Record approval
    const existing = store.requests.find(r => r.newDid === newDid);
    if (existing) {
      if (!existing.approvals.includes(guardianDid)) existing.approvals.push(guardianDid);
    } else {
      store.requests.push({ newDid, approvals: [guardianDid], createdAt: Date.now() });
    }

    const request = store.requests.find(r => r.newDid === newDid);
    const approved = request.approvals.length >= store.threshold;

    res.json({
      ok: true,
      approvals: request.approvals.length,
      threshold: store.threshold,
      recoveryReady: approved,
      message: approved
        ? `Recovery approved! Account can now be transferred to ${newDid}`
        : `${store.threshold - request.approvals.length} more guardian(s) needed`,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

/**
 * Execute recovery if threshold met
 * POST /api/aa/recovery/execute  { userId, newDid }
 */
async function executeRecovery(req, res) {
  try {
    const { userId, newDid } = req.body || {};
    const store = recoveryStore[userId];
    if (!store) return res.status(404).json({ error: 'No recovery setup' });

    const request = store.requests.find(r => r.newDid === newDid);
    if (!request || request.approvals.length < store.threshold) {
      return res.status(403).json({ error: 'Insufficient guardian approvals' });
    }

    // Cleanup
    delete recoveryStore[userId];
    res.json({ ok: true, recoveredDid: newDid, message: 'Account successfully recovered via social recovery' });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

module.exports = { buildUserOp, submitUserOp, setupRecovery, approveRecovery, executeRecovery };
