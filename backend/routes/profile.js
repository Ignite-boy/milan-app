const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const { readJson, writeJson, writeJsonAndSync, findUserById, addActivity } = require('../utils/store');
const { getDwnInfo, realDwnEngine } = require('../services/cloudDwnRegistry');

const router = express.Router();

const supabaseDb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function resolveAccount(req, users) {
  const email = String(req.userEmail || '').trim().toLowerCase();
  const localUser = email ? users[email] : null;

  if (localUser && (!req.userId || !localUser.id || localUser.id === req.userId)) {
    return {
      email,
      user: {
        ...localUser,
        id: localUser.id || req.userId,
        email: localUser.email || email,
        did: localUser.did
      }
    };
  }

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
  if (bytes.length > 900000) throw new Error('Use a profile picture under 900 KB.');
  const encodedData = bytes.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return { mime, bytes, encodedData };
}

async function writeProfilePictureToUserDwn(user, dataUrl, recordId) {
  const info = getDwnInfo(user);
  if (!info?.spaceId) throw new Error('User isolated DWN space is not available.');
  if (!user?.raw_seed) throw new Error('User isolated DWN identity seed is not available.');

  const record = {
    id: recordId,
    title: 'MILAN Profile Picture',
    schema: 'profile-picture',
    access: 'private',
    dataFormat: 'application/json',
    dateCreated: new Date().toISOString(),
    dateModified: new Date().toISOString(),
    data: {
      type: 'profile-picture',
      avatar: dataUrl,
      ownerDid: user.did,
      spaceId: info.spaceId
    }
  };

  const result = await realDwnEngine.writeRecord(
    {
      spaceId: info.spaceId,
      rawSeedHex: user.raw_seed,
      knownDidUri: user.did
    },
    record
  );

  if (!result?.ok) {
    throw new Error(result?.error || result?.reason || 'User isolated DWN profile picture write failed.');
  }

  return {
    ok: true,
    recordId,
    spaceId: info.spaceId,
    dwnRecordId: result.dwnRecordId,
    avatar: dataUrl
  };
}

async function readProfilePictureFromUserDwn(user, recordId) {
  const info = getDwnInfo(user);
  if (!info?.spaceId || !user?.raw_seed) return null;

  const result = await realDwnEngine.queryRecords(
    {
      spaceId: info.spaceId,
      rawSeedHex: user.raw_seed,
      knownDidUri: user.did
    },
    { schema: 'https://milanlife.in/schemas/profile-picture' }
  );

  if (!result?.ok || !Array.isArray(result.entries)) return null;

  const match = result.entries.find(entry => entry.recordId === recordId);
  if (!match) return null;

  // Query metadata alone does not contain record data, so the exact record is
  // read with the same user's isolated DWN node below.
  const opened = await realDwnEngine.openNode({
    spaceId: info.spaceId,
    rawSeedHex: user.raw_seed,
    knownDidUri: user.did
  });

  if (!opened?.ok) return null;

  const { node } = opened;
  const { RecordsRead } = await (async () => {
    const sdk = await import('@tbd54566975/dwn-sdk-js');
    return sdk;
  })();

  const read = await RecordsRead.create({
    signer: node.signer,
    filter: { recordId }
  });

  const response = await node.dwn.processMessage(node.tenantDid, read.message);
  const reply = response?.reply || response;

  if (response?.status?.code !== 200 && reply?.status?.code !== 200) return null;

  const record = response?.entries?.[0] || reply?.entries?.[0];
  if (!record) return null;

  const bytes = record.encodedData;
  if (!bytes) return null;

  const mime = record.descriptor?.dataFormat || 'image/jpeg';
  const base64 = String(bytes)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(String(bytes).length / 4) * 4, '=');

  return {
    recordId,
    avatar: `data:${mime};base64,${base64}`,
    spaceId: info.spaceId
  };
}

function queueProfilePictureSync(user, dataUrl, recordId) {
  void writeProfilePictureToUserDwn(user, dataUrl, recordId)
    .then(result => console.log('[profile] isolated user DWN DP sync complete:', result.spaceId, result.dwnRecordId))
    .catch(error => console.warn('[profile] isolated user DWN DP sync failed:', error.message));
}

router.get('/', auth, async (req, res) => {
  const users = readJson(global.usersFile, {});
  const found = await resolveAccount(req, users);
  if (!found) return res.status(404).json({ error: 'User not found' });

  const recordId = profileRecordId(found.user.did);

  try {
    const dwnPicture = await readProfilePictureFromUserDwn(found.user, recordId);
    if (dwnPicture?.avatar) {
      found.user.profile = {
        ...(found.user.profile || {}),
        avatar: dwnPicture.avatar,
        avatarRecordId: recordId,
        avatarSync: 'synced'
      };
      users[found.email] = found.user;
      writeJson(global.usersFile, users);
      return res.json({
        ...(found.user.profile || {}),
        avatar: dwnPicture.avatar,
        avatarRecordId: recordId,
        avatarSync: 'synced'
      });
    }
  } catch (error) {
    console.warn('[profile] isolated user DWN profile picture read failed:', error.message);
  }

  return res.json({
    ...(found.user.profile || {}),
    avatar: found.user.profile?.avatar || '',
    avatarRecordId: found.user.profile?.avatarRecordId || recordId,
    avatarSync: found.user.profile?.avatar ? 'local-fallback' : 'missing'
  });
});

router.put('/', auth, async (req, res) => {
  const users = readJson(global.usersFile, {});
  const found = await resolveAccount(req, users);
  if (!found) return res.status(404).json({ error: 'User not found' });

  const { display_name, username, bio, website, avatar } = req.body || {};

  try {
    const hasNewAvatar = avatar && String(avatar).startsWith('data:image/');
    if (hasNewAvatar) dataUrlToDwn(avatar);

    const cleanName = String(display_name || '').trim().slice(0, 80);
    const cleanUsername = String(username || '').trim().replace(/^@+/, '').toLowerCase().slice(0, 30);

    if (cleanUsername && !/^[a-z0-9._]{3,30}$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username must be 3–30 characters using letters, numbers, dot or underscore.' });
    }

    const previous = found.user.profile || {};
    found.user.profile = {
      ...previous,
      display_name: cleanName,
      username: cleanUsername,
      bio: String(bio || '').trim().slice(0, 500),
      website: String(website || '').trim().slice(0, 200),
      avatar: hasNewAvatar ? String(avatar) : (previous.avatar || ''),
      avatarRecordId: profileRecordId(found.user.did),
      avatarSync: hasNewAvatar ? 'pending' : (previous.avatarSync || 'synced'),
      updated_at: new Date().toISOString()
    };

    if (found.user.id && cleanName) {
      const { error: nameError } = await supabaseDb
        .from('users')
        .update({ name: cleanName })
        .eq('id', found.user.id);
      if (nameError) throw new Error('Profile name database update failed: ' + nameError.message);
    }

    users[found.email] = found.user;
    writeJson(global.usersFile, users);

    if (hasNewAvatar) {
      // Do not block the profile response on the DWN network.
      queueProfilePictureSync(
        found.user,
        found.user.profile.avatar,
        found.user.profile.avatarRecordId
      );
    }

    addActivity(req.userId, 'profile.updated');

    return res.status(200).json({
      ...found.user.profile,
      avatar: found.user.profile.avatar,
      avatarRecordId: found.user.profile.avatarRecordId,
      avatarSync: found.user.profile.avatarSync
    });
  } catch (error) {
    console.error('[profile] profile save failed:', error.message);
    return res.status(502).json({ error: 'Profile save failed', detail: error.message });
  }
});

router.put('/settings', auth, (req, res) => {
  const users = readJson(global.usersFile);
  const found = findUserById(users, req.userId);
  if (!found) return res.status(404).json({ error: 'User not found' });

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
