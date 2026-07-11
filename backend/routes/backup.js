const express = require('express');
const auth = require('../middleware/auth');
const { readJson, findUserById, addActivity } = require('../utils/store');
const dwnStore = require('../services/dwnService');

const router = express.Router();

router.get('/export', auth, async (req, res) => {
  const users = readJson(global.usersFile, {});
  const found = findUserById(users, req.userId);
  if (!found) return res.status(404).json({ error: 'User not found' });
  const records = await dwnStore.getOwnedRecords(req.userId, found.user.did);
  const protocols = (readJson(global.protocolsFile, {})[req.userId] || []);
  res.json({
    exportedAt: new Date().toISOString(),
    app: 'Web5 Identity Vault with DWN Storage',
    storage: dwnStore.getStatus(),
    identity: { email: found.email, did: found.user.did, profile: found.user.profile },
    records,
    protocols
  });
});

router.post('/wipe-my-records', auth, async (req, res) => {
  const count = await dwnStore.wipeUserRecords(req.userId);
  addActivity(req.userId, 'dwn.records.wiped', { count });
  res.json({ deleted: count, storage: 'DWN' });
});

module.exports = router;
