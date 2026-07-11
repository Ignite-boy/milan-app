const express = require('express');
const auth = require('../middleware/auth');
const { readJson, writeJson, findUserById } = require('../utils/store');
const { ensureUserDwn, makeDidDwnService, getDwnInfo } = require('../services/cloudDwnRegistry');
const router = express.Router();

router.get('/current', auth, (req, res) => {
  const users = readJson(global.usersFile, {});
  const found = findUserById(users, req.userId);
  if (!found) return res.status(404).json({ error:'User not found'});
  ensureUserDwn(found.user, found.email); users[found.email] = found.user; writeJson(global.usersFile, users);
  res.json({ did: found.user.did, email: found.email, dwn: getDwnInfo(found.user), created_at: found.user.created_at });
});

router.get('/document', auth, (req, res) => {
  const users = readJson(global.usersFile, {});
  const found = findUserById(users, req.userId);
  if (!found) return res.status(404).json({ error:'User not found'});
  ensureUserDwn(found.user, found.email); users[found.email] = found.user; writeJson(global.usersFile, users);
  res.json({
    '@context':['https://www.w3.org/ns/did/v1'],
    id:found.user.did,
    verificationMethod:[{id:`${found.user.did}#keys-1`, type:'JsonWebKey2020', controller:found.user.did, publicKeyJwk:{kty:'OKP', crv:'Ed25519', x: found.user.raw_seed?.slice(0,43) || 'demo'}}],
    authentication:[`${found.user.did}#keys-1`],
    service:[makeDidDwnService(found.user)]
  });
});
module.exports = router;
