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
 * The real DID is created and persisted by the DWN engine itself, so the
 * value stored on the user record is exactly the DID that signs the user's
 * real DWN protocol messages. Falls back to the legacy identifier only if
 * the engine/SDK is unavailable, so registration can never hard-fail.
 *
 * @param {{ userId:string, email:string }} args
 * @returns {Promise<{ did:string, rawSeedHex:string, spaceId:string, real:boolean }>}
 */
async function mintRealUserIdentity({ userId = '', email = '' } = {}) {
  const rawSeedHex = crypto.randomBytes(32).toString('hex');
  // spaceId is derived from a stable random seed (NOT the DID), so the user's
  // node namespace is fixed before the DID exists.
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
    }
  } catch (_) { /* fall through to legacy */ }

  // Fallback: legacy identifier (still unique), engine will mint a real DID
  // lazily on first record write.
  const legacy = generateDIDAndRawSeed();
  return { did: legacy.did, rawSeedHex, spaceId, real: false };
}

module.exports = { generateDIDAndRawSeed, mintRealUserIdentity };
