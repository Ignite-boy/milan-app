'use strict';

const crypto = require('crypto');

function base64Url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Legacy synchronous identifier (kept for compatibility / fallback only).
 * NOTE: This is NOT a spec-compliant did:key — prefer mintRealUserIdentity().
 */
function generateDIDAndRawSeed() {
  const seed = crypto.randomBytes(32);
  return { did: `did:key:z${base64Url(seed)}`, rawSeedHex: seed.toString('hex') };
}

/**
 * Mint a REAL cryptographic identity for a new user:
 *   - spaceId: stable per-user namespace for the user's isolated DWN node.
 *   - did: a real did:key (Ed25519) whose signing key lives in that node.
 *
 * The real DID is created and persisted by the DWN engine itself.
 * If the local DWN engine is temporarily unavailable, registration falls
 * back to the legacy identity so account creation is not blocked. The
 * returned `real` flag tells callers which mode was used.
 *
 * @param {{ userId:string, email:string }} args
 * @returns {Promise<{ did:string, rawSeedHex:string, spaceId:string, real:boolean }>}
 */
async function mintRealUserIdentity({ userId = '', email = '' } = {}) {
  const rawSeedHex = crypto.randomBytes(32).toString('hex');
  const seed = `${userId}|${rawSeedHex}|${email}`;
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  const spaceId = `milan-${(userId || hash).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40)}-${hash.slice(0, 8)}`;

  try {
    const engine = require('../services/realDwnEngine');
    if (engine.enabled()) {
      const opened = await engine.openNode({ spaceId });
      if (opened.ok && opened.node && opened.node.tenantDid) {
        return { did: opened.node.tenantDid, rawSeedHex, spaceId, real: true };
      }
      console.warn('[auth] real DID engine did not return a tenant DID; using registration fallback identity');
    }
  } catch (error) {
    console.warn('[auth] real DID engine unavailable during registration; using fallback identity:', error?.message || 'identity mint failed');
  }

  return {
    did: `did:milan:${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
    rawSeedHex,
    spaceId,
    real: false
  };
}

module.exports = { generateDIDAndRawSeed, mintRealUserIdentity };
