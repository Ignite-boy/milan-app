const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const { readJson, writeJson, findUserById, addActivity } = require('../utils/store');
const MINI_DWN_ENDPOINT = process.env.MINI_DWN_ENDPOINT || 'http://127.0.0.1:3000';

const router = express.Router();

const supabaseDb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function resolveAccount(req, users) {
  const byId = await supabaseDb
    .from('users')
    .select('id,email,name,did')
    .eq('id', req.userId)
    .maybeSingle();

  if (!byId.error && byId.data) {
    return {
      email: byId.data.email,
      user: {
        ...(users[byId.data.email] || {}),
        id: byId.data.id,
        email: byId.data.email,
        name: byId.data.name,
        did: byId.data.did
      }
    };
  }

  const email = String(req.userEmail || '').trim().toLowerCase();
  if (email) {
    const byEmail = await supabaseDb
      .from('users')
      .select('id,email,name,did')
      .eq('email', email)
      .maybeSingle();

    if (!byEmail.error && byEmail.data) {
      return {
        email: byEmail.data.email,
        user: {
          ...(users[byEmail.data.email] || {}),
          id: byEmail.data.id,
          email: byEmail.data.email,
          name: byEmail.data.name,
          did: byEmail.data.did
        }
      };
    }
  }

  return null;
}

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

async function miniDwnProcess(target, message, encodedData) {
  const response = await fetch(`${MINI_DWN_ENDPOINT}/json-rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now().toString(),
      method: 'dwn.processMessage',
      params: {
        target,
        message,
        ...(encodedData ? { encodedData } : {})
      }
    })
  });

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const raw = await response.text();

  let body;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    const preview = raw.replace(/\s+/g, ' ').slice(0, 220);
    throw new Error(`Mini-DWN returned non-JSON (${response.status}, ${contentType || 'no content-type'}): ${preview}`);
  }

  const reply = body?.result?.reply;
  const status = reply?.status?.code;

  if (!response.ok) {
    throw new Error(`Mini-DWN HTTP ${response.status}`);
  }

  if (status >= 400) {
    throw new Error(reply?.status?.detail || `Mini-DWN status ${status}`);
  }

  return reply || {};
}

async function writeProfilePicture(did, dataUrl) {
  const parsed = dataUrlToDwn(dataUrl);
  if (!parsed) return null;

  const recordId = profileRecordId(did);

  const message = {
    descriptor: {
      interface: 'Records',
      method: 'Write',
      recordId,
      dataFormat: parsed.mime,
      dateCreated: new Date().toISOString(),
      dateModified: new Date().toISOString()
    },
    authorization: {
      payload: 'e30',
      signatures: []
    }
  };

  const reply = await miniDwnProcess(did, message, parsed.encodedData);

  if (reply.status?.code !== 202) {
    throw new Error(reply.status?.detail || 'Mini-DWN profile write failed');
  }

  return {
    recordId,
    mime: parsed.mime,
    dataSize: parsed.bytes.length,
    avatar: dataUrl
  };
}

async function readProfilePicture(did) {
  const recordId = profileRecordId(did);

  const message = {
    descriptor: {
      interface: 'Records',
      method: 'Read',
      recordId
    },
    authorization: {
      payload: 'e30',
      signatures: []
    }
  };

  const reply = await miniDwnProcess(did, message);

  if (reply.status?.code === 404) {
    return null;
  }

  if (reply.status?.code !== 200) {
    throw new Error(reply.status?.detail || 'Mini-DWN profile read failed');
  }

  const encodedData = reply.encodedData;
  if (!encodedData) return null;

  const mime = reply.record?.dataFormat || 'image/jpeg';

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
  const found = await resolveAccount(req, users);

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
  const found = await resolveAccount(req, users);

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
