const express = require('express');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const { readJson, writeJson, writeJsonAndSync, findUserById, addActivity } = require('../utils/store');
const { getDwnInfo, realDwnEngine, syncDatabaseSnapshot, pullDatabaseSnapshot } = require('../services/cloudDwnRegistry');

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

function profileAvatarSnapshotName(email = '') {
  const digest = crypto
    .createHash('sha256')
    .update(String(email || '').trim().toLowerCase())
    .digest('hex')
    .slice(0, 24);
  return `profile-avatar-${digest}.json`;
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
  // realDwnEngine resolves/imports the persisted DID key material
  // from the user's isolated DWN node store for this space.

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
    throw new Error(
      result?.error ||
      result?.reason ||
      'User isolated DWN profile picture write failed.'
    );
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
  if (!info?.spaceId) return null;

  const result = await realDwnEngine.readRecord(
    {
      spaceId: info.spaceId,
      rawSeedHex: user.raw_seed,
      knownDidUri: user.did
    },
    recordId
  );

  if (!result?.ok || !result.data) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(result.data).toString('utf8'));
  } catch {
    return null;
  }

  const avatar = String(payload?.data?.avatar || payload?.avatar || '').trim();
  if (!avatar) return null;

  return {
    recordId,
    avatar,
    spaceId: info.spaceId
  };
}

async function readDurableProfileAvatar(email) {
  try {
    const snapshot = await pullDatabaseSnapshot(profileAvatarSnapshotName(email));
    const avatar = String(snapshot?.avatar || snapshot?.data?.avatar || '').trim();
    return avatar || null;
  } catch (error) {
    console.warn('[profile] durable profile avatar read failed:', error.message);
    return null;
  }
}

async function writeDurableProfileAvatar(email, avatar, recordId, did) {
  const name = profileAvatarSnapshotName(email);
  const result = await syncDatabaseSnapshot(name, {
    avatar,
    recordId,
    ownerDid: did,
    updatedAt: new Date().toISOString()
  });
  if (!result || result.ok === false) {
    throw new Error(result?.error || result?.skipped || 'Durable profile avatar sync failed.');
  }
  return result;
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

  // The isolated LevelDB DWN may be recreated after a service restart.
  // Use the durable remote avatar snapshot as the recovery source before
  // falling back to the local users.json cache.
  const durableAvatar = await readDurableProfileAvatar(found.email);
  if (durableAvatar) {
    found.user.profile = {
      ...(found.user.profile || {}),
      avatar: durableAvatar,
      avatarRecordId: recordId,
      avatarSync: 'remote-snapshot'
    };

    users[found.email] = found.user;
    writeJson(global.usersFile, users);

    return res.json({
      ...(found.user.profile || {}),
      avatar: durableAvatar,
      avatarRecordId: recordId,
      avatarSync: 'remote-snapshot'
    });
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
    const recordId = profileRecordId(found.user.did);

    found.user.profile = {
      ...previous,
      display_name: cleanName,
      username: cleanUsername,
      bio: String(bio || '').trim().slice(0, 500),
      website: String(website || '').trim().slice(0, 200),
      avatar: hasNewAvatar ? String(avatar) : (previous.avatar || ''),
      avatarRecordId: recordId,
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

    // Keep the real per-user DWN write as the first persistence layer.
    if (hasNewAvatar) {
      const saved = await writeProfilePictureToUserDwn(
        found.user,
        found.user.profile.avatar,
        recordId
      );

      found.user.profile.avatarSync = 'synced';
      found.user.profile.avatarRecordId = saved.dwnRecordId || recordId;
    }

    users[found.email] = found.user;

    if (hasNewAvatar) {
      // Persist the profile locally, then persist the avatar in its own
      // durable remote-DWN snapshot. Both must succeed before reporting
      // the profile update as successful.
      const syncResult = await writeJsonAndSync(global.usersFile, users);
      if (!syncResult || syncResult.ok === false) {
        throw new Error(
          syncResult?.error || 'Profile remote DWN persistence failed.'
        );
      }

      const durableResult = await writeDurableProfileAvatar(
        found.email,
        found.user.profile.avatar,
        recordId,
        found.user.did
      );

      if (!durableResult || durableResult.ok === false) {
        throw new Error(
          durableResult?.error ||
          durableResult?.skipped ||
          'Profile avatar durable persistence failed.'
        );
      }

      found.user.profile.avatarSync = 'durable-synced';
    } else {
      writeJson(global.usersFile, users);
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
    return res.status(502).json({
      error: 'Profile save failed',
      detail: error.message
    });
  }
});

router.put('/settings', (req, res) => {
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
