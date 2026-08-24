const express = require('express');
const auth = require('../middleware/auth');
const { readJson, writeJson, findUserById, addActivity } = require('../utils/store');
const realDwn = require('../services/realDwnNodeClient');

const router = express.Router();

function profileRecordId(did) {
  return `profile-picture:${did}`;
}

function dataUrlToDwn(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  const base64 = match[2].replace(/\s+/g, '');
  const bytes = Buffer.from(base64, 'base64');

  if (!bytes.length) return null;
  if (bytes.length > 900000) {
    throw new Error('Use a profile picture under 900 KB.');
  }

  const encodedData = bytes.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return { mime, bytes, encodedData };
}

async function writeProfilePicture(did, dataUrl) {
  const parsed = dataUrlToDwn(dataUrl);
  if (!parsed) return null;

  const recordId = profileRecordId(did);

  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'dwn.processMessage',
    params: {
      target: did,
      message: {
        descriptor: {
          interface: 'Records',
          method: 'Write',
          recordId,
          dataFormat: parsed.mime
        }
      },
      encodedData: parsed.encodedData
    }
  };

  const response = await realDwn.postJson('/json-rpc', payload);
  const statusCode = response?.result?.reply?.status?.code;

  if (statusCode !== 202) {
    const detail = response?.result?.reply?.status?.detail || 'DWN profile-picture write failed';
    throw new Error(detail);
  }

  return {
    recordId,
    mime: parsed.mime,
    dataCid: response?.result?.reply?.dataCid || '',
    dataSize: response?.result?.reply?.dataSize || parsed.bytes.length
  };
}

async function readProfilePicture(did) {
  const recordId = profileRecordId(did);

  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'dwn.processMessage',
    params: {
      target: did,
      message: {
        descriptor: {
          interface: 'Records',
          method: 'Read',
          recordId
        }
      }
    }
  };

  const response = await realDwn.postJson('/json-rpc', payload);
  const reply = response?.result?.reply || {};
  const encodedData = reply.encodedData;

  if (!encodedData) return null;

  const mime =
    reply?.record?.dataFormat ||
    reply?.result?.dataFormat ||
    'image/jpeg';

  const base64 = String(encodedData)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(String(encodedData).length / 4) * 4, '=');

  return {
    recordId,
    avatar: `data:${mime};base64,${base64}`
  };
}

router.get('/', auth, async (req, res) => {
  const users = readJson(global.usersFile, {});
  const found = findUserById(users, req.userId);

  if (!found) {
    return res.status(404).json({ error: 'User not found' });
  }

  try {
    const dwnPicture = await readProfilePicture(found.user.did);

    res.json({
      ...(found.user.profile || {}),
      ...(dwnPicture ? {
        avatar: dwnPicture.avatar,
        avatarRecordId: dwnPicture.recordId
      } : {})
    });
  } catch (error) {
    console.error('[profile] DWN read failed:', error.message);
    return res.status(503).json({
      error: 'Profile picture DWN read failed',
      detail: error.message
    });
  }
});

router.put('/', auth, async (req, res) => {
  const users = readJson(global.usersFile, {});
  const found = findUserById(users, req.userId);

  if (!found) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { display_name, bio, website, avatar } = req.body || {};

  try {
    let dwnPicture = null;

    if (avatar && String(avatar).startsWith('data:image/')) {
      dwnPicture = await writeProfilePicture(found.user.did, avatar);
    } else {
      dwnPicture = await readProfilePicture(found.user.did);
    }

    found.user.profile = {
      display_name: String(display_name || '').trim(),
      bio: String(bio || '').trim(),
      website: String(website || '').trim(),
      avatar: dwnPicture?.avatar || '',
      avatarRecordId: dwnPicture?.recordId || profileRecordId(found.user.did),
      updated_at: new Date().toISOString()
    };

    users[found.email] = found.user;
    writeJson(global.usersFile, users);
    addActivity(req.userId, 'profile.updated');

    return res.status(200).json(found.user.profile);
  } catch (error) {
    console.error('[profile] DWN write/read failed:', error.message);
    return res.status(502).json({
      error: 'Profile picture DWN save failed',
      detail: error.message
    });
  }
});

router.put('/settings', auth, (req, res) => {
  const users = readJson(global.usersFile);
  const found = findUserById(users, req.userId);

  if (!found) {
    return res.status(404).json({ error: 'User not found' });
  }

  found.user.settings = {
    ...(found.user.settings || {}),
    ...req.body,
    updated_at: new Date().toISOString()
  };

  users[found.email] = found.user;
  writeJson(global.usersFile, users);

  res.json(found.user.settings);
});

module.exports = router;
