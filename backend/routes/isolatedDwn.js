const express = require('express');
const auth = require('../middleware/auth');
const { readJson, findUserById, findUserByDid } = require('../utils/store');
const dwnStore = require('../services/dwnService');
const { ensureUserDwn, getDwnInfo, storageRootFor, realUserDwnNodeStatus } = require('../services/cloudDwnRegistry');
const fs = require('fs');
const path = require('path');

const router = express.Router();

function current(req) {
  return findUserById(readJson(global.usersFile, {}), req.userId);
}

router.get('/my-server', auth, async (req, res) => {
  const found = current(req);
  if (!found) return res.status(404).json({ error: 'User not found' });
  ensureUserDwn(found.user, found.email);
  const dwn = getDwnInfo(found.user);
  const root = storageRootFor(dwn.spaceId);
  const manifestFile = path.join(root, 'manifest.json');
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch (_) {}
  const realNode = await realUserDwnNodeStatus(found.user).catch(err => ({ ok: false, error: err.message }));
  res.json({ ok: true, ownerDid: found.user.did, email: found.email, dwn, manifest, realNode, storage: dwnStore.getStatus() });
});

// Dedicated real DWN node health + cryptographic proof for the current user.
router.get('/real-node', auth, async (req, res) => {
  const found = current(req);
  if (!found) return res.status(404).json({ error: 'User not found' });
  ensureUserDwn(found.user, found.email);
  const realNode = await realUserDwnNodeStatus(found.user).catch(err => ({ ok: false, error: err.message }));
  res.json({ ok: realNode.ok !== false, ownerDid: found.user.did, realNode });
});

router.get('/:spaceId/status', auth, (req, res) => {
  const found = current(req);
  if (!found) return res.status(404).json({ error: 'User not found' });
  ensureUserDwn(found.user, found.email);
  const dwn = getDwnInfo(found.user);
  if (dwn.spaceId !== req.params.spaceId) return res.status(403).json({ error: 'This isolated DWN belongs to another DID.' });
  res.json({ ok: true, isolation: dwn.isolation, spaceId: dwn.spaceId, endpoint: dwn.endpoint, ownerDid: found.user.did });
});

router.get('/resolve-owner/:did', auth, (req, res) => {
  const did = decodeURIComponent(req.params.did || '');
  const found = findUserByDid(readJson(global.usersFile, {}), did);
  if (!found) return res.status(404).json({ exists: false, error: 'DID not found locally' });
  ensureUserDwn(found.user, found.email);
  const info = getDwnInfo(found.user);
  res.json({ exists: true, did, display_name: found.user.profile?.display_name || '', dwn: { endpoint: info.endpoint, mode: info.mode, isolation: info.isolation, spaceId: info.spaceId } });
});

module.exports = router;
