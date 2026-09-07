const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const { readJson, writeJson, writeJsonAndSync, findUserById, addActivity } = require('../utils/store');
const { getDwnInfo, realDwnEngine } = require('../services/cloudDwnRegistry');
const MINI_DWN_ENDPOINT = (
  process.env.MINI_DWN_ENDPOINT ||
  `${process.env.MILAN_LIVE_DWN_BASE || 'https://milan-app-pzhf.onrender.com'}/api/dwn`
).replace(/\/$/, '');

const router = express.Router();

const supabaseDb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function resolveAccount(req, users) {
  // Fast path: the authenticated email already maps to the local profile.
  // This avoids an unnecessary Supabase round-trip on every DP upload.
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
  const maxAttempts = 4;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${MINI_DWN_ENDPOINT}/json-rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Bearer milan-v49-embedded-production-dwn-key'
        },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `${Date.now()}-${attempt}`,
          method: 'dwn.processMessage',
          params: {
            target,
            message,
            ...(encodedData ? { encodedData } : {})
          }
        })
      });

      const contentType = String(
        response.headers.get('content-type') || ''
      ).toLowerCase();

      const raw = await response.text();

      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        const preview = raw.replace(/\s+/g, ' ').slice(0, 220);
        throw new Error(
          `Mini-DWN returned non-JSON (${response.status}, ${contentType || 'no content-type'}): ${preview}`
        );
      }

      const reply = body?.result?.reply;
      const status = reply?.status?.code;

      if ([408, 425, 429, 500, 502, 503, 504, 530].includes(response.status)) {
        if (attempt < maxAttempts) {
          const retryAfterHeader = response.headers.get('retry-after');
          const retryAfterSeconds = Number(retryAfterHeader);

          const waitMs =
            Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
              ? Math.min(retryAfterSeconds * 1000, 10000)
              : Math.min(500 * (2 ** (attempt - 1)), 4000);

          await new Promise(resolve => setTimeout(resolve, waitMs));
          continue;
        }

        throw new Error(
          `Mini-DWN HTTP ${response.status} after ${maxAttempts} attempts`
        );
      }

      if (!response.ok) {
        throw new Error(`Mini-DWN HTTP ${response.status}`);
      }

      if (status >= 400) {
        throw new Error(
          reply?.status?.detail || `Mini-DWN status ${status}`
        );
      }

      return reply || {};
    } catch (err) {
      lastError = err;

      const messageText = String(err?.message || err);

      const transient =
        /Mini-DWN HTTP (408|425|429|500|502|503|504|530)/.test(messageText) ||
        /timed out|aborted|ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(messageText);

      if (!transient || attempt >= maxAttempts) {
        throw err;
      }

      const waitMs = Math.min(500 * (2 ** (attempt - 1)), 4000);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('Mini-DWN request failed');
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
    throw new Error(
      reply.status?.detail || 'Mini-DWN profile write failed'
    );
  }

  return {
    recordId,
    mime: parsed.mime,
    dataSize: parsed.bytes.length,
    avatar: dataUrl,
    liveDwn: true
  };
}

async function writeProfilePictureToUserDwn(user, dataUrl, recordId) {
  const info = getDwnInfo(user);

  if (!info?.spaceId) {
    throw new Error('User isolated DWN space is not available.');
  }

  if (!user?.raw_seed) {
    throw new Error('User isolated DWN identity seed is not available.');
  }

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

function queueProfilePictureSync(user, dataUrl, recordId) {
  void writeProfilePictureToUserDwn(user, dataUrl, recordId)
    .then(result => {
      console.log(
        '[profile] isolated user DWN DP sync complete:',
        result.spaceId,
        result.dwnRecordId
      );
    })
    .catch(error => {
      console.warn(
        '[profile] isolated user DWN DP sync failed:',
        error.message
      );
    });
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

  // The persisted profile avatar is the stable application value.
  // Mini-DWN is used for synchronization/verification, but a temporary
  // DWN outage must never make an already-saved DP disappear on reload.
  const persistedAvatar = String(
    found.user.profile?.avatar || ''
  ).trim();

  // IMPORTANT:
  // The saved profile avatar is authoritative for reloads.
  // A stale/failed DWN read must never replace or erase it.
  if (persistedAvatar) {
    return res.json({
      ...(found.user.profile || {}),
      avatar: persistedAvatar,
      avatarRecordId:
        found.user.profile?.avatarRecordId ||
        profileRecordId(found.user.did),
      avatarSync: found.user.profile?.avatarSync || 'persisted'
    });
  }

  // No persisted avatar exists yet, so DWN may provide the first copy.
  try {
    const dwnPicture = await readProfilePicture(found.user.did);

    if (dwnPicture?.avatar) {
      return res.json({
        ...(found.user.profile || {}),
        avatar: dwnPicture.avatar,
        avatarRecordId: dwnPicture.recordId,
        avatarSync: 'synced'
      });
    }
  } catch (error) {
    console.warn(
      '[profile] DWN profile picture read failed:',
      error.message
    );
  }

  return res.json({
    ...(found.user.profile || {}),
    avatar: persistedAvatar,
    avatarRecordId:
      found.user.profile?.avatarRecordId ||
      profileRecordId(found.user.did),
    avatarSync: persistedAvatar ? 'local-fallback' : 'missing'
  });
});

router.put('/', auth, async (req, res) => {
  const users = readJson(global.usersFile, {});
  const found = await resolveAccount(req, users);

  if (!found) {
    return res.status(404).json({ error: 'User not found' });
  }

  const {
    display_name,
    username,
    bio,
    website,
    avatar
  } = req.body || {};

  try {
    let dwnPicture = null;
    let avatarSyncPending = false;

    if (avatar && String(avatar).startsWith('data:image/')) {
      // Validate the image synchronously, but NEVER block the API response
      // on the remote Mini-DWN write.
      const parsed = dataUrlToDwn(avatar);
      if (!parsed) {
        return res.status(400).json({ error: 'Invalid profile picture data.' });
      }

      dwnPicture = {
        recordId: profileRecordId(found.user.did),
        avatar: String(avatar),
        liveDwn: false
      };
      avatarSyncPending = true;
    } else {
      // Name/bio/settings saves do not need to wait for a remote DP read.
      dwnPicture = {
        recordId:
          found.user.profile?.avatarRecordId ||
          profileRecordId(found.user.did),
        avatar: found.user.profile?.avatar || ''
      };
    }

    const cleanName = String(display_name || '').trim().slice(0, 80);
    const cleanUsername = String(username || '')
      .trim()
      .replace(/^@+/, '')
      .toLowerCase()
      .slice(0, 30);

    if (
      cleanUsername &&
      !/^[a-z0-9._]{3,30}$/.test(cleanUsername)
    ) {
      return res.status(400).json({
        error: 'Username must be 3–30 characters using letters, numbers, dot or underscore.'
      });
    }

    found.user.profile = {
      ...(found.user.profile || {}),
      display_name: cleanName,
      username: cleanUsername,
      bio: String(bio || '').trim().slice(0, 500),
      website: String(website || '').trim().slice(0, 200),
      avatar: dwnPicture?.avatar || '',
      avatarRecordId:
        dwnPicture?.recordId ||
        profileRecordId(found.user.did),
      avatarSync:
        avatarSyncPending
          ? 'pending'
          : (found.user.profile?.avatarSync || 'synced'),
      updated_at: new Date().toISOString()
    };

    if (found.user.id && cleanName) {
      const { error: nameError } = await supabaseDb
        .from('users')
        .update({ name: cleanName })
        .eq('id', found.user.id);

      if (nameError) {
        throw new Error(
          'Profile name database update failed: ' +
          nameError.message
        );
      }
    }

    // CRITICAL:
    // Save the DP to the persistent profile first.
    // DWN is synchronization only and must never make the upload fail.
    if (avatarSyncPending) {
      found.user.profile.avatarSync = 'pending';

      // Background DWN sync; do not block the profile response.
      queueProfilePictureSync(
        found.user,
        found.user.profile.avatar,
        found.user.profile.avatarRecordId
      );
    }

    users[found.email] = found.user;

    // Immediate persistent profile save.
    writeJson(global.usersFile, users);

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
