'use strict';

const crypto = require('crypto');

function base64Url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateDIDAndRawSeed() {
  const seed = crypto.randomBytes(32);
  return { did: `did:key:z${base64Url(seed)}`, rawSeedHex: seed.toString('hex') };
}

async function mintRealUserIdentity({ userId = '', email = '' } = {}) {
  const rawSeedHex = crypto.randomBytes(32).toString('hex');
  const seed = `${userId}|${rawSeedHex}|${email}`;
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  const spaceId = `milan-${(userId || hash).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40)}-${hash.slice(0, 8)}`;

  try {
    const engine = require('../services/realDwnEngine');
    if (engine.enabled()) {
      const opened = await Promise.race([
        engine.openNode({ spaceId }),
        new Promise(resolve => setTimeout(() => resolve(null), 1200))
      ]);
      if (opened?.ok && opened.node && opened.node.tenantDid) {
        return { did: opened.node.tenantDid, rawSeedHex, spaceId, real: true };
      }
      console.warn('[auth] real DID engine unavailable/slow during registration; using fallback identity');
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
